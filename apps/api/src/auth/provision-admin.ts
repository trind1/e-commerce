import argon2 from 'argon2';
import { Role } from '@prisma/client';
import { readConfig } from '../config.js';
import { createDatabaseClient } from '../db/client.js';
import { loadProjectEnvironment } from '../environment.js';
import { displayNameSchema, emailSchema, normalizeEmail, passwordSchema } from './policy.js';
import { verifyAdminProvisionToken } from './provision-token.js';

loadProjectEnvironment();
const provisionToken = process.env.ADMIN_PROVISION_TOKEN;
const provisionTokenHash = process.env.ADMIN_PROVISION_TOKEN_HASH;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

verifyAdminProvisionToken(provisionToken, provisionTokenHash);
if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required.');

const config = readConfig();
if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const normalizedEmail = emailSchema.parse(email);
const exactPassword = passwordSchema.parse(password);
const database = createDatabaseClient(config.DATABASE_URL);

try {
  const existingAdmin = await database.user.findFirst({ where: { role: Role.ADMIN } });
  if (existingAdmin) throw new Error('An Admin account has already been provisioned.');
  await database.user.create({
    data: {
      email: normalizeEmail(normalizedEmail),
      passwordHash: await argon2.hash(exactPassword, { type: argon2.argon2id }),
      displayName: process.env.ADMIN_DISPLAY_NAME
        ? displayNameSchema.parse(process.env.ADMIN_DISPLAY_NAME)
        : null,
      role: Role.ADMIN,
    },
  });
} finally {
  await database.$disconnect();
}
