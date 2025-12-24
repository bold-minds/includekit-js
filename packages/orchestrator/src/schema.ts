import { readFile } from 'fs/promises';
import type { AppSchema } from '@includekit/core';

export interface SchemaConfig {
  file?: string;
  json?: AppSchema;
}

/**
 * Load and validate schema
 * Priority: file > json
 */
export async function loadSchema(config: SchemaConfig): Promise<AppSchema> {
  let schema: AppSchema;

  // Priority 1: Load from file
  if (config.file) {
    try {
      const content = await readFile(config.file, 'utf-8');
      schema = JSON.parse(content);
    } catch (error: any) {
      throw new Error(`Failed to load schema from ${config.file}: ${error.message}`);
    }
  }
  // Priority 2: Use inline JSON
  else if (config.json) {
    schema = config.json;
  }
  // No schema provided
  else {
    throw new Error(
      'No schema provided. Specify schema.file or schema.json. ' +
        'DMMF introspection not yet supported.'
    );
  }

  // Basic validation before passing to engine
  if (!schema.version || typeof schema.version !== 'number') {
    throw new Error('Invalid schema: missing or invalid version field');
  }

  if (!Array.isArray(schema.models) || schema.models.length === 0) {
    throw new Error('Invalid schema: models must be a non-empty array');
  }

  // Validate each model has required fields
  for (const model of schema.models) {
    if (!model.name || typeof model.name !== 'string') {
      throw new Error(`Invalid schema: model missing name`);
    }

    if (!model.id || !model.id.kind) {
      throw new Error(`Invalid schema: model '${model.name}' missing id config`);
    }

    if (
      model.id.kind === 'composite' &&
      (!model.id.fields || model.id.fields.length === 0)
    ) {
      throw new Error(
        `Invalid schema: model '${model.name}' has composite id but no fields`
      );
    }
  }

  return schema;
}
