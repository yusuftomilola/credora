import { Injectable, Logger } from '@nestjs/common';

export interface TransformationRule {
  type: 'map' | 'filter' | 'rename' | 'format' | 'validate';
  field?: string;
  source?: string;
  target?: string;
  condition?: any;
  format?: string;
  validation?: any;
}

@Injectable()
export class TransformationService {
  private readonly logger = new Logger(TransformationService.name);

  transformRequest(data: any, rules: TransformationRule[]): any {
    if (!rules || rules.length === 0) {
      return data;
    }

    try {
      let result = { ...data };

      for (const rule of rules) {
        result = this.applyRule(result, rule);
      }

      return result;
    } catch (error) {
      this.logger.error('Request transformation failed', error);
      return data; 
    }
  }

  transformResponse(data: any, rules: TransformationRule[]): any {
    if (!rules || rules.length === 0) {
      return data;
    }

    try {
      let result = { ...data };

      for (const rule of rules) {
        result = this.applyRule(result, rule);
      }

      return result;
    } catch (error) {
      this.logger.error('Response transformation failed', error);
      return data; 
    }
  }

  private applyRule(data: any, rule: TransformationRule): any {
    switch (rule.type) {
      case 'map':
        return this.mapField(data, rule);
      case 'filter':
        return this.filterData(data, rule);
      case 'rename':
        return this.renameField(data, rule);
      case 'format':
        return this.formatField(data, rule);
      case 'validate':
        return this.validateField(data, rule);
      default:
        return data;
    }
  }

  private mapField(data: any, rule: TransformationRule): any {
    if (!rule.source || !rule.target) {
      return data;
    }

    const sourceValue = this.getNestedValue(data, rule.source);
    if (sourceValue !== undefined) {
      this.setNestedValue(data, rule.target, sourceValue);
    }

    return data;
  }

  private filterData(data: any, rule: TransformationRule): any {
    if (!rule.condition) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.filter(item => this.evaluateCondition(item, rule.condition));
    }

    if (this.evaluateCondition(data, rule.condition)) {
      return data;
    }

    return null;
  }

  private renameField(data: any, rule: TransformationRule): any {
    if (!rule.source || !rule.target) {
      return data;
    }

    if (data && typeof data === 'object' && rule.source in data) {
      data[rule.target] = data[rule.source];
      delete data[rule.source];
    }

    return data;
  }

  private formatField(data: any, rule: TransformationRule): any {
    if (!rule.field || !rule.format) {
      return data;
    }

    const value = this.getNestedValue(data, rule.field);
    if (value !== undefined) {
      const formattedValue = this.applyFormat(value, rule.format);
      this.setNestedValue(data, rule.field, formattedValue);
    }

    return data;
  }

  private validateField(data: any, rule: TransformationRule): any {
    if (!rule.field || !rule.validation) {
      return data;
    }

    const value = this.getNestedValue(data, rule.field);
    const isValid = this.validateValue(value, rule.validation);

    if (!isValid) {
      this.logger.warn(`Validation failed for field ${rule.field}: ${value}`);
    }

    return data;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop();
    
    if (!lastKey) return;

    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);

    target[lastKey] = value;
  }

private evaluateCondition(data: any, condition: any): boolean {
  try {
    for (const [key, expectedValue] of Object.entries(condition)) {
      const actualValue = this.getNestedValue(data, key);

      if (typeof expectedValue === 'object' && expectedValue !== null) {
        if ('$gt' in expectedValue && typeof expectedValue.$gt === 'number' && actualValue <= expectedValue.$gt) return false;
        if ('$lt' in expectedValue && typeof expectedValue.$lt === 'number' && actualValue >= expectedValue.$lt) return false;
        if ('$in' in expectedValue && Array.isArray(expectedValue.$in) && !expectedValue.$in.includes(actualValue)) return false;
        if ('$nin' in expectedValue && Array.isArray(expectedValue.$nin) && expectedValue.$nin.includes(actualValue)) return false;
      } else {
        if (actualValue !== expectedValue) return false;
      }
    }

    return true;
  } catch (error) {
    this.logger.error('Condition evaluation failed', error);
    return false;
  }
}

  private applyFormat(value: any, format: string): any {
    try {
      switch (format.toLowerCase()) {
        case 'uppercase':
          return typeof value === 'string' ? value.toUpperCase() : value;
        case 'lowercase':
          return typeof value === 'string' ? value.toLowerCase() : value;
        case 'date':
          return new Date(value).toISOString();
        case 'number':
          return Number(value);
        case 'string':
          return String(value);
        case 'boolean':
          return Boolean(value);
        default:
          if (format.startsWith('date:')) {
            const pattern = format.substring(5);
            return this.formatDate(value, pattern);
          }
          return value;
      }
    } catch (error) {
      this.logger.error(`Format application failed for format ${format}`, error);
      return value;
    }
  }

  private formatDate(value: any, pattern: string): string {
    try {
      const date = new Date(value);
      
      switch (pattern) {
        case 'iso':
          return date.toISOString();
        case 'utc':
          return date.toUTCString();
        case 'locale':
          return date.toLocaleDateString();
        default:
          return date.toISOString();
      }
    } catch (error) {
      return value;
    }
  }

  private validateValue(value: any, validation: any): boolean {
    try {
      if (validation.required && (value === undefined || value === null)) {
        return false;
      }

      if (validation.type) {
        const actualType = typeof value;
        if (actualType !== validation.type) {
          return false;
        }
      }

      if (validation.min !== undefined && value < validation.min) {
        return false;
      }

      if (validation.max !== undefined && value > validation.max) {
        return false;
      }

      if (validation.pattern && typeof value === 'string') {
        const regex = new RegExp(validation.pattern);
        if (!regex.test(value)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.error('Validation failed', error);
      return false;
    }
  }
}

