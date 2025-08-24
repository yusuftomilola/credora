// A service for implementing K-anonymity on datasets.
import { Injectable } from '@nestjs/common';

@Injectable()
export class KAnonymityService {
  /**
   * Applies k-anonymity to a dataset based on specified quasi-identifiers.
   * This is a simplified example using generalization.
   * In a real-world scenario, this would involve more complex algorithms.
   *
   * @param data The input array of objects to anonymize.
   * @param quasiIdentifiers An array of keys to identify quasi-identifiers.
   * @param k The anonymity factor.
   * @returns The anonymized dataset.
   */
  applyKAnonymity<T extends object>(data: T[], quasiIdentifiers: (keyof T)[], k: number): T[] {
    const anonymizedData: T[] = [];
    const groups = this.groupDataByQuasiIdentifiers(data, quasiIdentifiers);

    for (const groupKey in groups) {
      if (groups[groupKey].length >= k) {
        // This group meets the k-anonymity requirement. Add it to the result.
        anonymizedData.push(...groups[groupKey]);
      } else {
        // If a group does not meet the requirement, generalize or suppress it.
        // Here, we'll demonstrate a simple generalization.
        anonymizedData.push(...this.generalizeGroup(groups[groupKey], quasiIdentifiers));
      }
    }

    return anonymizedData;
  }

  /**
   * Groups data objects by the values of their quasi-identifiers.
   * @param data The input array of objects.
   * @param quasiIdentifiers The keys to group by.
   * @returns An object where keys are the combined quasi-identifier values and
   * values are the arrays of data objects belonging to that group.
   */
  private groupDataByQuasiIdentifiers<T extends object>(data: T[], quasiIdentifiers: (keyof T)[]): { [key: string]: T[] } {
    const groups: { [key: string]: T[] } = {};
    for (const item of data) {
      const groupKey = quasiIdentifiers.map(key => item[key]).join('|');
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
    }
    return groups;
  }

  /**
   * Generalizes a group's quasi-identifiers if the group is too small.
   * This is a placeholder for a more sophisticated generalization strategy.
   * @param group The small group of data objects.
   * @param quasiIdentifiers The keys to generalize.
   * @returns The generalized data objects.
   */
  private generalizeGroup<T extends object>(group: T[], quasiIdentifiers: (keyof T)[]): T[] {
    return group.map(item => {
      const generalizedItem = { ...item };
      for (const key of quasiIdentifiers) {
        if (typeof generalizedItem[key] === 'string' && generalizedItem[key].toString().includes('@')) {
          // Example: Generalize email domain.
          (generalizedItem[key] as any) = '[generalized-email]';
        } else if (typeof generalizedItem[key] === 'number') {
          // Example: Generalize age into ranges.
          const age = generalizedItem[key] as number;
          (generalizedItem[key] as any) = `${Math.floor(age / 10) * 10}-${Math.floor(age / 10) * 10 + 9}`;
        }
      }
      return generalizedItem;
    });
  }
}