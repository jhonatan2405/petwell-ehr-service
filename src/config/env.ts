import dotenv from 'dotenv';

dotenv.config();

const requiredEnvVars = [
    'JWT_SECRET',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
    }
}

export const env = {
    port: parseInt(process.env['PORT'] ?? '3004', 10),
    nodeEnv: process.env['NODE_ENV'] ?? 'development',
    jwtSecret: process.env['JWT_SECRET'] as string,
    supabaseUrl: process.env['SUPABASE_URL'] as string,
    supabaseServiceRoleKey: process.env['SUPABASE_SERVICE_ROLE_KEY'] as string,
    allowedOrigins: (process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:3000').split(','),
    petServiceUrl: process.env['PET_SERVICE_URL'] ?? 'http://localhost:3002',
    userServiceUrl: process.env['USER_SERVICE_URL'] ?? 'http://localhost:3003',
    isDevelopment: process.env['NODE_ENV'] === 'development',
    isProduction: process.env['NODE_ENV'] === 'production',
};
