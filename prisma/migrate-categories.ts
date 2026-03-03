/**
 * One-time migration: create group categories and set parentId on all sub-categories.
 * Run with: npx ts-node prisma/migrate-categories.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const GROUPS = [
  {
    name: 'Shop',
    slug: 'shop',
    description: 'Shop by product type',
    sortOrder: 1,
    subSlugs: ['jar-candles', 'scented-sachets', 'tealights', 'gift-boxes', 'custom-name-candles'],
  },
  {
    name: 'Occasions',
    slug: 'occasions',
    description: 'Shop by occasion',
    sortOrder: 2,
    subSlugs: ['birthdays', 'baby-showers', 'anniversaries', 'housewarming', 'festivals', 'return-favors'],
  },
  {
    name: 'Wedding & Events',
    slug: 'wedding-events',
    description: 'Wedding and event gifting',
    sortOrder: 3,
    subSlugs: ['wedding-favors', 'mehendi-haldi', 'bridal-shower', 'save-the-date', 'luxury-hampers', 'bulk-events'],
  },
  {
    name: 'Corporate',
    slug: 'corporate-gifting',
    description: 'Corporate gifting solutions',
    sortOrder: 4,
    subSlugs: ['corporate', 'client-gifts', 'welcome-kits', 'festive-hampers', 'brand-candles'],
  },
  {
    name: 'Featured',
    slug: 'featured',
    description: 'Featured products shown on the home page',
    sortOrder: 5,
    subSlugs: [],
  },
]

async function main() {
  console.log('Starting category migration...\n')

  for (const group of GROUPS) {
    const { subSlugs, ...groupData } = group

    // 1. Create the group category (upsert by slug)
    const groupCat = await prisma.category.upsert({
      where: { slug: groupData.slug },
      update: { name: groupData.name, description: groupData.description, sortOrder: groupData.sortOrder },
      create: { ...groupData, parentId: null },
    })
    console.log(`✓ Group: ${groupCat.name} (${groupCat.id})`)

    // 2. Update all sub-categories to point to this group
    if (subSlugs.length > 0) {
      const result = await prisma.category.updateMany({
        where: { slug: { in: subSlugs } },
        data: { parentId: groupCat.id },
      })
      console.log(`  → Updated ${result.count} sub-categories`)
    }
  }

  console.log('\nMigration complete!')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
