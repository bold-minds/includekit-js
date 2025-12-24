import { readFile } from 'fs/promises';
import { Engine, EngineStatus, statusToErrorCode, type EngineError } from './types';
import type { AppSchema, Statement, Mutation, Dependencies } from '../types';

/**
 * WASM exports interface
 */
interface WASMExports {
  memory: WebAssembly.Memory;
  ik_version: () => number;
  ik_set_schema: (ptr: number, len: number) => number;
  ik_compute_shape_id: (ptr: number, len: number) => number;
  ik_add_query: (ptr: number, len: number) => number;
  ik_invalidate: (ptr: number, len: number) => number;
  ik_explain_invalidation: (ptr: number, len: number) => number;
  ik_reset: () => number;
  ik_health: () => number;
  ik_metrics: () => number;
  ik_audit_log: () => number;
  ik_malloc: (size: number) => number;
  ik_free: (ptr: number, size: number) => void;
  ik_take_result: (outPtr: number, outLen: number) => void;
  ik_last_error: (outPtr: number, outLen: number) => void;
}

/**
 * WASM Engine implementation
 */
class WASMEngine implements Engine {
  private readonly exports: WASMExports;
  private readonly memory: WebAssembly.Memory;
  private readonly textEncoder: TextEncoder;
  private readonly textDecoder: TextDecoder;

  constructor(instance: WebAssembly.Instance) {
    this.exports = instance.exports as unknown as WASMExports;
    this.memory = this.exports.memory;
    this.textEncoder = new TextEncoder();
    this.textDecoder = new TextDecoder();
  }

  async version(): Promise<{ core: string; contract: string; abi: string }> {
    const status = this.exports.ik_version();
    if (status !== EngineStatus.OK) {
      throw this.getError(status);
    }
    return this.getResult();
  }

  async setSchema(schema: AppSchema): Promise<void> {
    const status = this.callWithJSON('ik_set_schema', schema);
    if (status !== EngineStatus.OK) {
      throw this.getError(status);
    }
  }

  async computeShapeId(statement: Statement): Promise<{ shapeId: string }> {
    const status = this.callWithJSON('ik_compute_shape_id', statement);
    if (status !== EngineStatus.OK) {
      throw this.getError(status);
    }
    return this.getResult();
  }

  async addQuery(input: {
    shape: Statement;
    resultHint?: Record<string, any[]>;
  }): Promise<{ shapeId: string; dependencies: Dependencies }> {
    const status = this.callWithJSON('ik_add_query', input);
    if (status !== EngineStatus.OK) {
      throw this.getError(status);
    }
    return this.getResult();
  }

  async invalidate(mutation: Mutation): Promise<{ evict: string[] }> {
    const status = this.callWithJSON('ik_invalidate', mutation);
    if (status !== EngineStatus.OK) {
      throw this.getError(status);
    }
    return this.getResult();
  }

  async explainInvalidation(input: {
    mutation: Mutation;
    shapeId: string;
  }): Promise<{ invalidate: boolean; reasons: string[] }> {
    const status = this.callWithJSON('ik_explain_invalidation', input);
    if (status !== EngineStatus.OK) {
      throw this.getError(status);
    }
    return this.getResult();
  }

  async reset(): Promise<void> {
    const status = this.exports.ik_reset();
    if (status !== EngineStatus.OK) {
      throw this.getError(status);
    }
  }

  /**
   * Call a WASM function with JSON input
   */
  private callWithJSON(funcName: keyof WASMExports, input: any): number {
    let json: string;
    try {
      json = JSON.stringify(input);
      if (json.includes('\0')) {
        throw new Error('Input contains NULL bytes');
      }
    } catch (error: any) {
      throw new Error(`Failed to serialize input: ${error.message}`);
    }
    
    const bytes = this.textEncoder.encode(json);
    const len = bytes.length;

    // Allocate memory
    const ptr = this.exports.ik_malloc(len);
    if (ptr === 0) {
      throw new Error('WASM memory allocation failed');
    }

    try {
      // Get fresh buffer reference in case memory grew
      const buffer = this.memory.buffer;
      const memoryView = new Uint8Array(buffer, ptr, len);
      memoryView.set(bytes);

      // Call function
      const func = this.exports[funcName] as (ptr: number, len: number) => number;
      const status = func(ptr, len);

      return status;
    } finally {
      // Free memory
      this.exports.ik_free(ptr, len);
    }
  }

  /**
   * Get result from WASM after successful call
   */
  private getResult<T = any>(): T {
    // ik_take_result writes ptr and len to memory[0:8]
    // Always get fresh buffer reference in case memory grew
    let buffer = this.memory.buffer;
    const ptrArray = new Uint32Array(buffer, 0, 1);
    const lenArray = new Uint32Array(buffer, 4, 1);

    this.exports.ik_take_result(0, 4);

    const ptr = ptrArray[0];
    const len = lenArray[0];

    // Get fresh buffer again after WASM call
    buffer = this.memory.buffer;
    const view = new Uint8Array(buffer, ptr, len);
    const json = this.textDecoder.decode(view);

    return JSON.parse(json);
  }

  /**
   * Get error from WASM after failed call
   */
  private getError(status: number): Error {
    try {
      // ik_last_error writes ptr and len to memory[0:8]
      // Always get fresh buffer reference in case memory grew
      let buffer = this.memory.buffer;
      const ptrArray = new Uint32Array(buffer, 0, 1);
      const lenArray = new Uint32Array(buffer, 4, 1);

      this.exports.ik_last_error(0, 4);

      const ptr = ptrArray[0];
      const len = lenArray[0];

      // Get fresh buffer again after WASM call
      buffer = this.memory.buffer;
      const view = new Uint8Array(buffer, ptr, len);
      const json = this.textDecoder.decode(view);
      const error: EngineError = JSON.parse(json);

      return new Error(`[${error.code}] ${error.message}`);
    } catch {
      // Fallback if error parsing fails
      const code = statusToErrorCode(status);
      return new Error(`[${code}] Engine error (status: ${status})`);
    }
  }
}

/**
 * Load and initialize the WASM engine
 * 
 * @param pathOrFetcher - Path to WASM file or fetcher function
 * @returns Engine instance
 */
export async function loadEngine(
  pathOrFetcher: string | (() => Promise<ArrayBuffer>)
): Promise<Engine> {
  // Load WASM binary
  let wasmBytes: ArrayBuffer;

  if (typeof pathOrFetcher === 'string') {
    try {
      const buffer = await readFile(pathOrFetcher);
      wasmBytes = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      );
    } catch (error: any) {
      throw new Error(`Failed to load WASM: File not found at ${pathOrFetcher}`);
    }
  } else {
    try {
      wasmBytes = await pathOrFetcher();
    } catch (error: any) {
      throw new Error(`Failed to load WASM: ${error.message}`);
    }
  }

  // Instantiate WASM
  let instance: WebAssembly.Instance;
  try {
    const result = await WebAssembly.instantiate(wasmBytes);
    instance = result.instance;
  } catch (error: any) {
    throw new Error(`Failed to instantiate WASM: ${error.message}`);
  }

  // Validate required exports
  const requiredExports = [
    'ik_version',
    'ik_set_schema',
    'ik_compute_shape_id',
    'ik_add_query',
    'ik_invalidate',
    'ik_explain_invalidation',
    'ik_reset',
    'ik_health',
    'ik_metrics',
    'ik_audit_log',
    'ik_malloc',
    'ik_free',
    'ik_take_result',
    'ik_last_error',
    'memory',
  ];

  for (const exp of requiredExports) {
    if (!(exp in instance.exports)) {
      throw new Error(`Invalid WASM: Missing required export '${exp}'`);
    }
  }

  return new WASMEngine(instance);
}
