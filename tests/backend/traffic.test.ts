import { describe, it, expect } from 'vitest';
import {
  connectionBudget,
  routeTemplate,
} from '../../supabase/functions/api/traffic';
describe('bounded connection bursts and private log templates', () => {
  it('refills by elapsed time, separates connections, and bounds key count', () => {
    let ms = 0;
    const admit = connectionBudget({
      rate: 2,
      burst: 2,
      maxKeys: 2,
      now: () => ms,
    });
    expect(admit('a')).toBe(true);
    expect(admit('a')).toBe(true);
    expect(admit('a')).toBe(false);
    expect(admit('b')).toBe(true);
    ms = 500;
    expect(admit('a')).toBe(true);
    expect(admit('a')).toBe(false);
    expect(admit('c')).toBe(true);
    expect(admit('a')).toBe(true);
  });
  it('drops identities and unknown paths from observability labels', () => {
    expect(routeTemplate('/functions/v1/api/v1/posts/private-id')).toBe(
      '/posts/:id',
    );
    expect(routeTemplate('/api/v1/entities/private-id/comments')).toBe(
      '/entities/:id/comments',
    );
    expect(routeTemplate('/api/v1/requests/legacy/14')).toBe(
      '/requests/legacy/:number',
    );
    expect(routeTemplate('/api/v1/secret-token')).toBe('unknown');
  });
});
