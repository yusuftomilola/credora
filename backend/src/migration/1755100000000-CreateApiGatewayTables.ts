import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateApiGatewayTables1755100000000 implements MigrationInterface {
  name = 'CreateApiGatewayTables1755100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "api_keys" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "key" varchar NOT NULL UNIQUE,
        "userId" varchar NOT NULL,
        "name" varchar,
        "isActive" boolean NOT NULL DEFAULT true,
        "permissions" jsonb,
        "rateLimit" integer NOT NULL DEFAULT 1000,
        "rateLimitPeriod" varchar NOT NULL DEFAULT 'hour',
        "expiresAt" timestamp,
        "lastUsedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_api_keys_key" ON "api_keys" ("key")`);
    await queryRunner.query(`CREATE INDEX "IDX_api_keys_userId" ON "api_keys" ("userId")`);

    await queryRunner.query(`
      CREATE TABLE "api_usage" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "apiKeyId" varchar NOT NULL,
        "endpoint" varchar NOT NULL,
        "method" varchar NOT NULL,
        "statusCode" integer NOT NULL,
        "responseTime" bigint NOT NULL,
        "requestSize" integer NOT NULL DEFAULT 0,
        "responseSize" integer NOT NULL DEFAULT 0,
        "metadata" jsonb,
        "userAgent" varchar NOT NULL,
        "ipAddress" varchar NOT NULL,
        "timestamp" timestamp NOT NULL DEFAULT now()
      )
    `);

    // Create indexes for API Usage
    await queryRunner.query(`CREATE INDEX "IDX_api_usage_apiKeyId_timestamp" ON "api_usage" ("apiKeyId", "timestamp")`);
    await queryRunner.query(`CREATE INDEX "IDX_api_usage_endpoint_timestamp" ON "api_usage" ("endpoint", "timestamp")`);

    await queryRunner.query(`
      CREATE TABLE "api_endpoints" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "path" varchar NOT NULL,
        "method" varchar NOT NULL,
        "version" varchar NOT NULL,
        "targetUrl" varchar NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "transformationRules" jsonb,
        "rateLimitConfig" jsonb,
        "circuitBreakerConfig" jsonb,
        "headers" jsonb,
        "timeout" integer NOT NULL DEFAULT 30000,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_api_endpoints_path_method" ON "api_endpoints" ("path", "method")`);
    await queryRunner.query(`CREATE INDEX "IDX_api_endpoints_version" ON "api_endpoints" ("version")`);

    await queryRunner.query(`
      CREATE TABLE "service_health" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "serviceName" varchar NOT NULL,
        "endpoint" varchar NOT NULL,
        "status" varchar NOT NULL CHECK (status IN ('healthy', 'unhealthy', 'degraded')),
        "responseTime" integer NOT NULL,
        "errorMessage" varchar,
        "metadata" jsonb,
        "timestamp" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_service_health_serviceName_timestamp" ON "service_health" ("serviceName", "timestamp")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "service_health"`);
    await queryRunner.query(`DROP TABLE "api_endpoints"`);
    await queryRunner.query(`DROP TABLE "api_usage"`);
    await queryRunner.query(`DROP TABLE "api_keys"`);
  }
}