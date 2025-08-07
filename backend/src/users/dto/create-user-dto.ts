import { IsString, IsEmail, IsNotEmpty } from 'class-validator';

export class CreateUserDto {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  @IsNotEmpty()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  @IsString()
  fullName: string;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  @IsEmail()
  email: string;
}
