// src/screening/screening.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([Watchlist, ScreeningResult, ScreeningMatch]),
    BullModule.registerQueue({
      name: 'screening-queue',
    }),
  ],
  providers: [
    ScreeningService,
    WatchlistService,
    FuzzyMatchingService,
    RiskScoringService,
    ScreeningProcessor,
  ],
  controllers: [ScreeningController],
  exports: [ScreeningService],
})
export class ScreeningModule {}
