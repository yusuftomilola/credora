// Create a script to populate initial watchlist data

import { WatchlistService } from "../services/watchlist.service";

// src/screening/scripts/populate-watchlists.ts
export async function populateWatchlists(watchlistService: WatchlistService) {
  // Sample OFAC data
  const ofacData = [
    {
      name: 'John Doe',
      type: 'individual',
      country: 'XX',
      reason: 'sanctions',
    },
    // Add more sample data
  ];

  await watchlistService.bulkImportWatchlistData('sanctions', 'ofac', ofacData);

  // Sample PEP data
  const pepData = [
    { name: 'Jane Smith', position: 'Minister', country: 'YY', risk: 'high' },
    // Add more sample data
  ];

  await watchlistService.bulkImportWatchlistData('pep', 'custom', pepData);
}
