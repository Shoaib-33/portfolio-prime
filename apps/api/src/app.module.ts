import { Module } from '@nestjs/common';
import { getDb } from './db/client';
import { PublicController } from './modules/public.controller';
import { AccountController } from './modules/account.controller';
import { DealsController } from './modules/deals.controller';
import { AdminController } from './modules/admin.controller';
import { MessagesController } from './modules/messages.controller';
import { JobsService } from './modules/jobs.service';

@Module({
  controllers: [PublicController, AccountController, DealsController, AdminController, MessagesController],
  providers: [{ provide: 'DB', useFactory: getDb }, JobsService],
})
export class AppModule {}
