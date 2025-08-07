// src/users/users.controller.ts
import { Body, Controller, Get, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user-dto';

@Controller('users') // <-- This sets the base path to '/users'
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post() // <-- This decorator is essential for the POST /users route
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }
}
