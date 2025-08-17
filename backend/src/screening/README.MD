# AML Screening Module Documentation

## Table of Contents
1. [Overview](#overview)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Database Schema](#database-schema)
5. [API Reference](#api-reference)
6. [Configuration](#configuration)
7. [Usage Examples](#usage-examples)
8. [Risk Scoring](#risk-scoring)
9. [Watchlist Management](#watchlist-management)
10. [Queue Processing](#queue-processing)
11. [Error Handling](#error-handling)
12. [Troubleshooting](#troubleshooting)

## Overview

The AML (Anti-Money Laundering) Screening Module is a comprehensive compliance system designed to screen entities against government watchlists and sanctions databases. It provides real-time and batch screening capabilities with fuzzy matching algorithms, risk scoring, and audit trail functionality.

### Key Capabilities
- Provider-agnostic design (works with any sanctions data source)
- Fuzzy string matching with configurable thresholds
- Risk-based scoring and classification
- Comprehensive audit trails
- False positive management
- Batch processing via queues
- RESTful API interface

## Features

### Core Screening Features
- **OFAC Sanctions List Screening** - Screen against Office of Foreign Assets Control lists
- **PEP (Politically Exposed Person) Checks** - Identify politically exposed individuals
- **Adverse Media Screening** - Check against negative news and media reports
- **Real-time Screening** - On-demand screening during onboarding
- **Ongoing Monitoring** - Periodic re-screening capabilities
- **Risk Scoring** - Algorithmic risk assessment based on matches
- **False Positive Management** - Review and manage screening results
- **Audit Trail** - Complete history of all screening activities
- **Custom Watchlist Support** - Import and manage custom watchlists

### Technical Features
- **Fuzzy Matching** - Levenshtein distance-based similarity matching
- **Batch Processing** - Queue-based processing for high volume
- **Provider Agnostic** - Flexible integration with any data source
- **Compliance Metadata** - Store screening results with full context

## Architecture

### Module Structure
\`\`\`
src/screening/
├── controllers/
│   └── screening.controller.ts
├── entities/
│   ├── watchlist.entity.ts
│   ├── screening-result.entity.ts
│   └── screening-match.entity.ts
├── services/
│   ├── screening.service.ts
│   ├── watchlist.service.ts
│   ├── fuzzy-matching.service.ts
│   └── risk-scoring.service.ts
├── processors/
│   └── screening.processor.ts
├── dto/
│   └── screen-entity.dto.ts
└── screening.module.ts
\`\`\`

### Service Dependencies
- **ScreeningService** - Main orchestration service
- **WatchlistService** - Manages watchlist data
- **FuzzyMatchingService** - Handles string similarity matching
- **RiskScoringService** - Calculates risk scores and classifications
- **ScreeningProcessor** - Queue-based batch processing

### Data Flow
1. **Request** → API endpoint receives screening request
2. **Queue** → Job added to screening queue for batch processing
3. **Processing** → Background processor performs screening
4. **Matching** → Fuzzy matching against all watchlists
5. **Scoring** → Risk score calculation based on matches
6. **Storage** → Results stored with audit metadata
7. **Response** → Results available via API endpoints

## Database Schema

### Watchlists Table
\`\`\`sql
CREATE TABLE watchlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL,
    type VARCHAR NOT NULL, -- 'sanctions', 'pep', 'adverse_media', 'custom'
    source VARCHAR NOT NULL, -- 'ofac', 'un', 'eu', 'custom'
    data JSONB NOT NULL, -- flexible watchlist entry data
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
\`\`\`

### Screening Results Table
\`\`\`sql
CREATE TABLE screening_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id VARCHAR NOT NULL, -- ID of entity being screened
    entity_type VARCHAR NOT NULL, -- 'user', 'company', etc.
    screening_data JSONB NOT NULL, -- data that was screened
    overall_risk_score INTEGER NOT NULL, -- 0-100
    status VARCHAR NOT NULL, -- 'clear', 'potential_match', 'blocked'
    matches JSONB NOT NULL DEFAULT '[]', -- array of match details
    is_false_positive BOOLEAN DEFAULT FALSE,
    reviewed_by VARCHAR NULL,
    review_notes TEXT NULL,
    screened_at TIMESTAMP DEFAULT NOW()
);
\`\`\`

### Screening Matches Table
\`\`\`sql
CREATE TABLE screening_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    screening_result_id UUID REFERENCES screening_results(id),
    watchlist_id VARCHAR NOT NULL,
    matched_field VARCHAR NOT NULL, -- 'name', 'passport', etc.
    match_score INTEGER NOT NULL, -- 0-100 similarity score
    match_details JSONB NOT NULL,
    risk_level VARCHAR NOT NULL -- 'low', 'medium', 'high'
);
\`\`\`

## API Reference

### Screen Entity
**POST** `/screening/screen`

Screen an entity against all watchlists.

**Request Body:**
\`\`\`json
{
  "entityId": "user-123",
  "entityType": "user",
  "screeningData": {
    "firstName": "John",
    "lastName": "Doe",
    "fullName": "John Michael Doe",
    "passportNumber": "AB123456",
    "dateOfBirth": "1990-01-01",
    "nationality": "US"
  }
}
\`\`\`

**Response:**
\`\`\`json
{
  "jobId": "12345",
  "message": "Screening job queued successfully"
}
\`\`\`

### Get Screening Result
**GET** `/screening/result/:id`

Retrieve screening results by ID.

**Response:**
\`\`\`json
{
  "id": "result-123",
  "entityId": "user-123",
  "entityType": "user",
  "overallRiskScore": 75,
  "status": "potential_match",
  "matches": [
    {
      "watchlistId": "watchlist-456",
      "matchedField": "fullName",
      "matchScore": 85,
      "riskLevel": "high"
    }
  ],
  "isFalsePositive": false,
  "screenedAt": "2024-01-15T10:30:00Z"
}
\`\`\`

### Mark False Positive
**POST** `/screening/false-positive/:id`

Mark a screening result as a false positive.

**Request Body:**
\`\`\`json
{
  "reviewedBy": "admin-user-id",
  "notes": "Confirmed false positive - different person with similar name"
}
\`\`\`

### Get Screening History
**GET** `/screening/history/:entityId`

Get all screening results for a specific entity.

**Response:**
\`\`\`json
[
  {
    "id": "result-123",
    "overallRiskScore": 75,
    "status": "potential_match",
    "screenedAt": "2024-01-15T10:30:00Z"
  },
  {
    "id": "result-124",
    "overallRiskScore": 0,
    "status": "clear",
    "screenedAt": "2024-01-10T09:15:00Z"
  }
]
\`\`\`

## Configuration

### Environment Variables
\`\`\`env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/database

# Redis (for queues)
REDIS_URL=redis://localhost:6379

# Screening Configuration
SCREENING_SIMILARITY_THRESHOLD=75
SCREENING_HIGH_RISK_THRESHOLD=80
SCREENING_MEDIUM_RISK_THRESHOLD=50
\`\`\`

### Module Configuration
\`\`\`typescript
// app.module.ts
@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
      },
    }),
    ScreeningModule,
  ],
})
export class AppModule {}
\`\`\`

## Usage Examples

### Basic Screening
\`\`\`typescript
// Screen a user during onboarding
const screeningData = {
  firstName: user.firstName,
  lastName: user.lastName,
  passportNumber: user.passportNumber,
  dateOfBirth: user.dateOfBirth
};

const jobId = await screeningService.screenEntity(
  user.id,
  'user',
  screeningData
);
\`\`\`

### Check Screening Results
\`\`\`typescript
// Check if screening is complete and get results
const result = await screeningService.getScreeningResult(resultId);

if (result.status === 'blocked') {
  // Handle high-risk match
  throw new ForbiddenException('Account blocked due to sanctions screening');
} else if (result.status === 'potential_match') {
  // Require manual review
  await notifyComplianceTeam(result);
}
\`\`\`

### Periodic Re-screening
\`\`\`typescript
// Set up scheduled re-screening
@Cron('0 0 * * 0') // Weekly
async performWeeklyScreening() {
  const users = await this.userRepository.find();
  
  for (const user of users) {
    await this.screeningService.screenEntity(
      user.id,
      'user',
      this.extractScreeningData(user)
    );
  }
}
\`\`\`

## Risk Scoring

### Scoring Algorithm
The risk scoring system uses a weighted approach based on:

1. **Match Score** (0-100) - Fuzzy matching similarity
2. **Watchlist Type Weight** - Different weights for different list types
3. **Source Reliability Weight** - Weight based on data source quality

### Watchlist Type Weights
- **Sanctions Lists**: 1.0 (highest weight)
- **PEP Lists**: 0.8
- **Adverse Media**: 0.6
- **Custom Lists**: 0.7

### Source Weights
- **OFAC**: 1.0
- **UN Sanctions**: 0.9
- **EU Sanctions**: 0.9
- **Custom Sources**: 0.6

### Risk Classification
- **High Risk** (80-100): Immediate review required
- **Medium Risk** (50-79): Manual review recommended
- **Low Risk** (1-49): Monitor but allow
- **Clear** (0): No matches found

## Watchlist Management

### Importing Watchlist Data
\`\`\`typescript
// Bulk import OFAC sanctions data
const ofacData = [
  {
    name: "John Doe",
    type: "individual",
    country: "XX",
    reason: "sanctions violation"
  }
];

await watchlistService.bulkImportWatchlistData(
  'sanctions',
  'ofac',
  ofacData
);
\`\`\`

### Custom Watchlists
\`\`\`typescript
// Create custom watchlist
const customWatchlist = await watchlistService.createWatchlist({
  name: 'Internal High Risk',
  type: 'custom',
  source: 'internal',
  data: {
    name: 'Jane Smith',
    reason: 'Internal investigation',
    riskLevel: 'high'
  }
});
\`\`\`

### Watchlist Updates
- Watchlists should be updated regularly from authoritative sources
- Consider automated daily/weekly updates for official lists
- Maintain version control for watchlist changes
- Archive old watchlist versions for audit purposes

## Queue Processing

### Queue Configuration
\`\`\`typescript
// Configure screening queue
BullModule.registerQueue({
  name: 'screening-queue',
  redis: {
    host: 'localhost',
    port: 6379,
  },
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50,      // Keep last 50 failed jobs
    attempts: 3,           // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
})
\`\`\`

### Monitoring Queue Health
\`\`\`typescript
// Check queue status
const waiting = await screeningQueue.getWaiting();
const active = await screeningQueue.getActive();
const completed = await screeningQueue.getCompleted();
const failed = await screeningQueue.getFailed();

console.log(`Queue status: ${waiting.length} waiting, ${active.length} active`);
\`\`\`

## Error Handling

### Common Error Scenarios

#### Watchlist Data Issues
\`\`\`typescript
try {
  await screeningService.screenEntity(entityId, entityType, screeningData);
} catch (error) {
  if (error instanceof WatchlistNotFoundError) {
    // Handle missing watchlist data
    logger.warn('Watchlist data not available, screening skipped');
  }
}
\`\`\`

#### Queue Processing Failures
\`\`\`typescript
@Process('screen-entity')
async handleScreening(job: Job) {
  try {
    return await this.screeningService.performScreening(
      job.data.entityId,
      job.data.entityType,
      job.data.screeningData
    );
  } catch (error) {
    logger.error(`Screening failed for ${job.data.entityId}:`, error);
    
    // Determine if error is retryable
    if (error instanceof TemporaryServiceError) {
      throw error; // Will be retried
    } else {
      // Log permanent failure and don't retry
      await this.logPermanentFailure(job.data, error);
      return { status: 'failed', error: error.message };
    }
  }
}
\`\`\`

### Error Response Codes
- **400 Bad Request** - Invalid screening data format
- **404 Not Found** - Screening result not found
- **429 Too Many Requests** - Rate limiting exceeded
- **500 Internal Server Error** - Screening service failure
- **503 Service Unavailable** - Watchlist data temporarily unavailable

## Troubleshooting

### Common Issues

#### Screening Jobs Not Processing
**Symptoms:** Jobs stuck in queue, no results generated
**Solutions:**
1. Check Redis connection
2. Verify queue processor is running
3. Check for memory/CPU constraints
4. Review error logs for failed jobs

#### Low Match Quality
**Symptoms:** Missing obvious matches or too many false positives
**Solutions:**
1. Adjust similarity threshold (default: 75%)
2. Improve data normalization
3. Add name variations to watchlists
4. Review fuzzy matching algorithm parameters

#### High False Positive Rate
**Symptoms:** Too many innocent matches flagged
**Solutions:**
1. Increase similarity threshold
2. Implement additional filtering rules
3. Improve watchlist data quality
4. Add whitelist functionality

#### Performance Issues
**Symptoms:** Slow screening response times
**Solutions:**
1. Optimize database queries
2. Add database indexes
3. Implement caching for frequently accessed watchlists
4. Consider horizontal scaling

### Debugging Tips

1. **Enable Debug Logging**
   \`\`\`typescript
   console.log('[v0] Screening started for entity:', entityId);
   console.log('[v0] Found matches:', matches.length);
   console.log('[v0] Risk score calculated:', riskScore);
   \`\`\`

2. **Monitor Queue Metrics**
   - Track job completion rates
   - Monitor average processing time
   - Alert on queue backlog growth

3. **Audit Data Quality**
   - Regularly review false positive rates
   - Validate watchlist data integrity
   - Monitor match score distributions

### Support and Maintenance

#### Regular Maintenance Tasks
- **Daily**: Monitor queue health and processing rates
- **Weekly**: Review false positive reports and adjust thresholds
- **Monthly**: Update watchlist data from official sources
- **Quarterly**: Audit screening effectiveness and compliance

#### Performance Monitoring
- Track screening volume and processing times
- Monitor database performance and query optimization
- Review memory usage and scaling requirements
- Analyze match quality and false positive rates

---

## Conclusion

The AML Screening Module provides a robust, scalable solution for compliance screening requirements. Its provider-agnostic design allows for easy integration with various data sources, while the comprehensive audit trail ensures regulatory compliance.

For additional support or feature requests, please contact the development team or create an issue in the project repository.

**Version:** 1.0.0  
**Last Updated:** August 2025  
**Maintainer:** Development Team
