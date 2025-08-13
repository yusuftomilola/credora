import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendAuditLog1755000000000 implements MigrationInterface {
  name = 'ExtendAuditLog1755000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "eventType" character varying NOT NULL DEFAULT 'user.activity'`);
    await queryRunner.query(`ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "resource" character varying`);
    await queryRunner.query(`ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "resourceId" character varying`);
    await queryRunner.query(`ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "outcome" character varying NOT NULL DEFAULT 'success'`);
    await queryRunner.query(`ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "ip" character varying`);
    await queryRunner.query(`ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "userAgent" character varying`);
    await queryRunner.query(`ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "requestId" character varying`);
    await queryRunner.query(`ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "sessionId" character varying`);
    await queryRunner.query(`ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "actorType" character varying NOT NULL DEFAULT 'user'`);
    await queryRunner.query(`ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "service" character varying`);
    await queryRunner.query(`ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "prevHash" character varying(128)`);
    await queryRunner.query(`ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "hash" character varying(128)`);
    await queryRunner.query(`ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "anchorCid" character varying`);
    await queryRunner.query(`ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "sequenceNumber" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "retentionUntil" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_userId" ON "audit_log" ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_eventType" ON "audit_log" ("eventType")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_resource" ON "audit_log" ("resource")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_resourceId" ON "audit_log" ("resourceId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_outcome" ON "audit_log" ("outcome")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_requestId" ON "audit_log" ("requestId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_prevHash" ON "audit_log" ("prevHash")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_hash" ON "audit_log" ("hash")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_anchorCid" ON "audit_log" ("anchorCid")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_sequenceNumber" ON "audit_log" ("sequenceNumber")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_retentionUntil" ON "audit_log" ("retentionUntil")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_retentionUntil"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_sequenceNumber"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_anchorCid"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_hash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_prevHash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_requestId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_outcome"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_resourceId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_resource"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_eventType"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_userId"`);
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "retentionUntil"`);
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "sequenceNumber"`);
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "anchorCid"`);
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "hash"`);
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "prevHash"`);
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "service"`);
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "actorType"`);
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "sessionId"`);
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "requestId"`);
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "userAgent"`);
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "ip"`);
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "outcome"`);
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "resourceId"`);
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "resource"`);
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "eventType"`);
  }
}


