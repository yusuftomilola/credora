import { Controller, Post, Body, Query, ParseIntPipe } from '@nestjs/common';
import { AnonymizeDataDto } from '../dto/anonymize-data.dto';
import { PiiDetectionService } from '../services/pii-detection.service';
import { PseudonymizationService } from '../services/pseudonymization.service';
import { KAnonymityService } from '../services/k-anonymity.service';
import { DifferentialPrivacyService } from '../services/differential-privacy.service';
import { IsNumber, IsNotEmpty } from 'class-validator';

// A DTO for the K-anonymity endpoint
class KAnonymityDto {
  @IsNotEmpty()
  readonly data: any[];
}

// A DTO for the differential privacy endpoint
class DifferentialPrivacyDto {
  @IsNumber()
  readonly value: number;
}

@Controller('anonymize')
export class AnonymizationController {
  constructor(
    private readonly piiDetectionService: PiiDetectionService,
    private readonly pseudonymizationService: PseudonymizationService,
    private readonly kAnonymityService: KAnonymityService,
    private readonly differentialPrivacyService: DifferentialPrivacyService,
  ) {}

  @Post('mask')
  maskData(@Body() anonymizeDataDto: AnonymizeDataDto) {
    const maskedData = this.piiDetectionService.detectAndMaskPii(anonymizeDataDto.data);
    return { original: anonymizeDataDto.data, masked: maskedData };
  }

  @Post('pseudonymize')
  pseudonymizeData(@Body() anonymizeDataDto: AnonymizeDataDto) {
    const pseudonymizedData = this.pseudonymizationService.pseudonymize(anonymizeDataDto.data);
    return { original: anonymizeDataDto.data, pseudonymized: pseudonymizedData };
  }

  @Post('reverse-pseudonymize')
  reversePseudonymizeData(@Body() anonymizeDataDto: AnonymizeDataDto) {
    const originalData = this.pseudonymizationService.reversePseudonym(anonymizeDataDto.data);
    return { pseudonymized: anonymizeDataDto.data, original: originalData };
  }

  @Post('k-anonymity')
  applyKAnonymity(
    @Body() kAnonymityDto: KAnonymityDto,
    @Query('k', ParseIntPipe) k: number,
  ) {
    // You would replace this with your actual quasi-identifiers from the data.
    const quasiIdentifiers = ['city', 'age']; 
    const anonymizedData = this.kAnonymityService.applyKAnonymity(
      kAnonymityDto.data,
      quasiIdentifiers,
      k,
    );
    return { original: kAnonymityDto.data, anonymized: anonymizedData };
  }

  @Post('differential-privacy')
  addDifferentialPrivacy(
    @Body() differentialPrivacyDto: DifferentialPrivacyDto,
    @Query('epsilon', ParseIntPipe) epsilon: number,
  ) {
    // A simplified sensitivity for demonstration purposes.
    const sensitivity = 1;
    const noisyValue = this.differentialPrivacyService.addNoise(
      differentialPrivacyDto.value,
      epsilon,
      sensitivity,
    );
    return {
      original: differentialPrivacyDto.value,
      noisy: noisyValue,
      epsilon: epsilon,
    };
  }
}
