import { Injectable, OnModuleInit } from '@nestjs/common';
import { UsersService } from '../users/users.service'; // Example service

@Injectable()
export class CacheWarmingService implements OnModuleInit {
  constructor(private readonly usersService: UsersService) {}

  async onModuleInit() {
    // Pre-populate the cache with frequently accessed users
    const frequentUserIds = ['user-1', 'user-2', 'user-3'];
    for (const id of frequentUserIds) {
      await this.usersService.findOne(id);
    }
  }
}
