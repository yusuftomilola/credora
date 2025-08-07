import { IsString, IsEthereumAddress } from 'class-validator';

export class WalletAuthDto {
  @IsEthereumAddress()
  walletAddress: string;

  @IsString()
  signature: string;

  @IsString()
  message: string;
}
