import { PartialType } from '@nestjs/mapped-types';
import { CreatePlaidDto } from './create-plaid.dto';

export class UpdatePlaidDto extends PartialType(CreatePlaidDto) {}
