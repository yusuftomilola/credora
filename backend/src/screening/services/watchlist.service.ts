// src/screening/services/watchlist.service.ts
@Injectable()
export class WatchlistService {
  constructor(
    @InjectRepository(Watchlist)
    private watchlistRepository: Repository<Watchlist>,
  ) {}

  async createWatchlist(createWatchlistDto: any): Promise<Watchlist> {
    const watchlist = this.watchlistRepository.create(createWatchlistDto);
    return this.watchlistRepository.save(watchlist);
  }

  async getAllWatchlists(): Promise<Watchlist[]> {
    return this.watchlistRepository.find();
  }

  async getWatchlistsByType(type: string): Promise<Watchlist[]> {
    return this.watchlistRepository.find({ where: { type } });
  }

  async updateWatchlist(id: string, updateData: any): Promise<Watchlist> {
    await this.watchlistRepository.update(id, updateData);
    return this.watchlistRepository.findOne({ where: { id } });
  }

  async deleteWatchlist(id: string): Promise<void> {
    await this.watchlistRepository.delete(id);
  }

  // Method to bulk import watchlist data
  async bulkImportWatchlistData(
    type: string,
    source: string,
    data: any[],
  ): Promise<void> {
    const watchlistEntries = data.map((entry) => ({
      name: `${type}_${source}_${Date.now()}`,
      type,
      source,
      data: entry,
    }));

    await this.watchlistRepository.save(watchlistEntries);
  }
}
