# Credit Bureau Integration

This module provides integration with major credit bureaus (Experian, Equifax, TransUnion) to fetch credit reports and process credit data updates.

## Features

- Adapter pattern for different credit bureau APIs
- Normalized response format for consistent data structure
- Circuit breaker pattern for resilience
- Rate limiting and quota management via axios interceptors
- Error handling and retry logic with exponential backoff
- Webhook handling for updates from credit bureaus
- Support for sandbox/production environment switching
- Comprehensive test coverage

## Usage

### Getting Credit Reports

```typescript
// Inject CreditBureauService
constructor(private creditBureauService: CreditBureauService) {}

// Get credit report from a specific bureau
const experianReport = await this.creditBureauService.getCreditReport(
  'experian', 
  userId,
  {
    firstName: 'John',
    lastName: 'Doe',
    ssn: '123-45-6789',
    dob: '1990-01-01'
  }
);

// Get reports from all bureaus
const allReports = await this.creditBureauService.getAllCreditReports(userId);
```

### API Endpoints

- `GET /credit-bureaus/reports/:userId/:bureau` - Get credit report from specific bureau
- `GET /credit-bureaus/reports/:userId` - Get credit reports from all bureaus
- `POST /credit-bureaus/reports/request` - Request new credit report
- `POST /credit-bureaus/webhooks/:bureau` - Handle webhook from bureau

## Configuration

Add the following configuration to your `.env` file:

```
# Experian
CREDIT_BUREAU_EXPERIAN_API_KEY=your_experian_api_key
CREDIT_BUREAU_EXPERIAN_SANDBOX=true
CREDIT_BUREAU_EXPERIAN_SANDBOX_URL=https://sandbox-api.experian.com
CREDIT_BUREAU_EXPERIAN_PRODUCTION_URL=https://api.experian.com

# Equifax
CREDIT_BUREAU_EQUIFAX_API_KEY=your_equifax_api_key
CREDIT_BUREAU_EQUIFAX_SANDBOX=true
CREDIT_BUREAU_EQUIFAX_SANDBOX_URL=https://sandbox-api.equifax.com
CREDIT_BUREAU_EQUIFAX_PRODUCTION_URL=https://api.equifax.com

# TransUnion
CREDIT_BUREAU_TRANSUNION_API_KEY=your_transunion_api_key
CREDIT_BUREAU_TRANSUNION_SANDBOX=true
CREDIT_BUREAU_TRANSUNION_SANDBOX_URL=https://sandbox-api.transunion.com
CREDIT_BUREAU_TRANSUNION_PRODUCTION_URL=https://api.transunion.com
```

## Architecture

The module uses the adapter pattern to normalize interactions with different credit bureau APIs:

- `CreditBureauAdapter` - Interface that all adapters implement
- `BaseCreditBureauAdapter` - Common functionality for all adapters
- Specific adapters (`ExperianAdapter`, `EquifaxAdapter`, `TransUnionAdapter`)
- `CreditBureauService` - Orchestrates adapters and provides circuit breaking
- `CreditBureauController` - Exposes API endpoints
