import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { AuditLog } from '../privacy/entities/audit-log.entity';
import { IpfsService } from '../ipfs/ipfs.service';

export interface CreateAuditLogInput {
  userId?: string;
  action: string;
  details?: Record<string, unknown>;
  eventType?: string;
  resource?: string;
  resourceId?: string;
  outcome?: 'success' | 'failure';
  ip?: string;
  userAgent?: string;
  requestId?: string;
  sessionId?: string;
  actorType?: 'user' | 'system' | 'service';
  service?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly ipfsService: IpfsService,
  ) {}

  async recordLog(log: CreateAuditLogInput): Promise<AuditLog> {
    const previous = await this.auditLogRepository.find({
      order: { timestamp: 'DESC' },
      take: 1,
    });
    const prevHash = previous[0]?.hash ?? null;

    const entity = this.auditLogRepository.create({
      userId: log.userId ?? 'anonymous',
      action: log.action,
      details: log.details ?? {},
      eventType: log.eventType ?? 'user.activity',
      resource: log.resource,
      resourceId: log.resourceId,
      outcome: log.outcome ?? 'success',
      ip: log.ip,
      userAgent: log.userAgent,
      requestId: log.requestId,
      sessionId: log.sessionId,
      actorType: log.actorType ?? 'user',
      service: log.service,
      prevHash: prevHash ?? undefined,
      sequenceNumber: (previous[0]?.sequenceNumber ?? 0) + 1,
    });

    entity.hash = this.computeHash(entity);
    return this.auditLogRepository.save(entity);
  }

  async anchorBatchToIpfs(fromId?: string): Promise<{ cid: string | null; count: number }> {
    const qb = this.auditLogRepository
      .createQueryBuilder('log')
      .where('log.anchorCid IS NULL')
      .orderBy('log.timestamp', 'ASC')
      .limit(1000);

    if (fromId) {
      qb.andWhere('log.id > :fromId', { fromId });
    }

    const logs = await qb.getMany();
    if (!logs.length) {
      return { cid: null, count: 0 };
    }

    const payload = JSON.stringify(
      logs.map((l) => ({
        id: l.id,
        ts: l.timestamp,
        userId: l.userId,
        action: l.action,
        eventType: l.eventType,
        resource: l.resource,
        resourceId: l.resourceId,
        outcome: l.outcome,
        hash: l.hash,
        prevHash: l.prevHash,
      })),
    );
    const cid = await this.ipfsService.pinDocument(payload);
    if (cid) {
      await this.auditLogRepository
        .createQueryBuilder()
        .update(AuditLog)
        .set({ anchorCid: cid })
        .whereInIds(logs.map((l) => l.id))
        .execute();
    }
    return { cid: cid ?? null, count: logs.length };
  }

  async searchLogs(filters: {
    userId?: string;
    action?: string;
    eventType?: string;
    resource?: string;
    resourceId?: string;
    outcome?: string;
    from?: Date;
    to?: Date;
    requestId?: string;
  }): Promise<AuditLog[]> {
    const qb = this.auditLogRepository.createQueryBuilder('log').orderBy('log.timestamp', 'DESC');
    if (filters.userId) qb.andWhere('log.userId = :userId', { userId: filters.userId });
    if (filters.action) qb.andWhere('log.action = :action', { action: filters.action });
    if (filters.eventType) qb.andWhere('log.eventType = :eventType', { eventType: filters.eventType });
    if (filters.resource) qb.andWhere('log.resource = :resource', { resource: filters.resource });
    if (filters.resourceId) qb.andWhere('log.resourceId = :resourceId', { resourceId: filters.resourceId });
    if (filters.outcome) qb.andWhere('log.outcome = :outcome', { outcome: filters.outcome });
    if (filters.requestId) qb.andWhere('log.requestId = :requestId', { requestId: filters.requestId });
    if (filters.from) qb.andWhere('log.timestamp >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('log.timestamp <= :to', { to: filters.to });
    return qb.take(500).getMany();
  }

  async verifyChain(): Promise<{ ok: boolean; brokenAt?: string }>
  {
    const logs = await this.auditLogRepository.find({ order: { timestamp: 'ASC' } });
    let previousHash: string | undefined;
    for (const log of logs) {
      const computed = this.computeHash(log);
      if (log.hash !== computed) {
        return { ok: false, brokenAt: log.id };
      }
      if (log.prevHash && previousHash && log.prevHash !== previousHash) {
        return { ok: false, brokenAt: log.id };
      }
      previousHash = log.hash ?? undefined;
    }
    return { ok: true };
  }

  private computeHash(log: Partial<AuditLog>): string {
    const canonical = JSON.stringify({
      userId: log.userId,
      action: log.action,
      details: log.details ?? {},
      eventType: log.eventType,
      resource: log.resource,
      resourceId: log.resourceId,
      outcome: log.outcome,
      ip: log.ip,
      userAgent: log.userAgent,
      requestId: log.requestId,
      sessionId: log.sessionId,
      actorType: log.actorType,
      service: log.service,
      prevHash: log.prevHash ?? null,
      sequenceNumber: log.sequenceNumber ?? 0,
      timestamp: log.timestamp ? new Date(log.timestamp).toISOString() : null,
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

  async purgeBefore(cutoff: Date): Promise<{ deleted: number }> {
    const result = await this.auditLogRepository
      .createQueryBuilder()
      .delete()
      .from(AuditLog)
      .where('timestamp < :cutoff', { cutoff })
      .andWhere('(retentionUntil IS NULL OR retentionUntil < :cutoff)', { cutoff })
      .execute();
    return { deleted: result.affected || 0 };
  }

  async exportCsv(filters: { from?: Date; to?: Date }): Promise<{ csv: string }> {
    const qb = this.auditLogRepository.createQueryBuilder('log').orderBy('log.timestamp', 'ASC');
    if (filters.from) qb.andWhere('log.timestamp >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('log.timestamp <= :to', { to: filters.to });
    const logs = await qb.getMany();
    const header = [
      'timestamp','userId','action','eventType','resource','resourceId','outcome','requestId','sessionId','actorType','service','hash','prevHash','anchorCid'
    ];
    const rows = logs.map(l => [
      l.timestamp?.toISOString(), l.userId, l.action, l.eventType, l.resource, l.resourceId, l.outcome, l.requestId, l.sessionId, l.actorType, l.service, l.hash, l.prevHash, l.anchorCid
    ].map(v => (v === undefined || v === null) ? '' : String(v).replaceAll('"', '""')));
    const csv = [header.join(','), ...rows.map(r => r.map(v => /[,"\n]/.test(v) ? `"${v}"` : v).join(','))].join('\n');
    return { csv };
  }
}


