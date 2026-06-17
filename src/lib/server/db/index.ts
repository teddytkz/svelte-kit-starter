import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { env } from '$lib/env';
import * as schema from './schema';

const connection = await mysql.createConnection({
	host: env.DB.URL,
	port: env.DB.PORT,
	user: env.DB.USER,
	password: env.DB.PASS,
	database: env.DB.NAME,
	multipleStatements: true
});

export const db = drizzle(connection, { schema, mode: 'default' });
