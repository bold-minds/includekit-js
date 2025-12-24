import { PrismaClient } from '@prisma/client';
import { withIncludeKit, MemoryLRU } from '@includekit/prisma';

async function main() {
  // Initialize Prisma client
  const basePrisma = new PrismaClient();

  // Create cache
  const cache = new MemoryLRU({
    maxItems: 1000,
    defaultTtlMs: 300000, // 5 minutes
  });

  // Wrap with IncludeKit
  const prisma = await withIncludeKit(basePrisma, {
    schema: {
      file: './includekit-schema.json',
    },
    cache,
    insights: {
      emit: (event) => {
        console.log(`[IncludeKit] ${event.eventType}:`, event.shapeId);
      },
    },
  });

  console.log('\n=== IncludeKit + Prisma Example ===\n');

  // Example 1: Cache miss - first query
  console.log('1. First query (cache miss)...');
  const users1 = await prisma.user.findMany({
    include: { posts: true },
  });
  console.log(`Found ${users1.length} users\n`);

  // Example 2: Cache hit - same query
  console.log('2. Same query again (cache hit)...');
  const users2 = await prisma.user.findMany({
    include: { posts: true },
  });
  console.log(`Found ${users2.length} users\n`);

  // Example 3: Write operation - invalidation
  console.log('3. Creating new post (will evict cache)...');
  const newPost = await prisma.post.create({
    data: {
      title: 'New Post',
      content: 'This will invalidate the cache',
      published: true,
      authorId: users1[0]?.id || 'unknown',
    },
  });
  console.log(`Created post: ${newPost.title}\n`);

  // Example 4: Query after invalidation (cache miss)
  console.log('4. Query after write (cache miss)...');
  const users3 = await prisma.user.findMany({
    include: { posts: true },
  });
  console.log(`Found ${users3.length} users\n`);

  // Example 5: Transaction
  console.log('5. Transaction test...');
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          name: 'Transaction User',
          email: 'tx@example.com',
        },
      });

      await tx.post.create({
        data: {
          title: 'Transaction Post',
          published: false,
          authorId: users1[0]?.id || 'unknown',
        },
      });

      console.log('Transaction committed\n');
    });
  } catch (error) {
    console.error('Transaction failed:', error);
  }

  // Example 6: Diagnostics
  console.log('6. Diagnostics:');
  const version = await prisma.$includeKit.getVersion();
  console.log('Engine version:', version);

  const stats = prisma.$includeKit.getCacheStats();
  console.log('Cache stats:', stats);

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
