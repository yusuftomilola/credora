import { PartialType } from '@nestjs/mapped-types';
import { CreateBankingDto } from './create-banking.dto';

export class UpdateBankingDto extends PartialType(CreateBankingDto) {}
