import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding database...');

  // Clear existing data
  await prisma.tag.deleteMany();
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();

  // Create users
  const alice = await prisma.user.create({
    data: {
      name: 'Alice',
      email: 'alice@example.com',
    },
  });

  const bob = await prisma.user.create({
    data: {
      name: 'Bob',
      email: 'bob@example.com',
    },
  });

  // Create tags
  const techTag = await prisma.tag.create({
    data: { name: 'Technology' },
  });

  const newsTag = await prisma.tag.create({
    data: { name: 'News' },
  });

  // Create posts
  await prisma.post.create({
    data: {
      title: 'Alice First Post',
      content: 'Hello World!',
      published: true,
      authorId: alice.id,
      tags: {
        connect: [{ id: techTag.id }],
      },
    },
  });

  await prisma.post.create({
    data: {
      title: 'Bob First Post',
      content: 'My first blog post',
      published: true,
      authorId: bob.id,
      tags: {
        connect: [{ id: newsTag.id }, { id: techTag.id }],
      },
    },
  });

  console.log('Seed completed!');
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
