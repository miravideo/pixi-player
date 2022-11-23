
import Clip from '@/core/clip';

describe('time/clip', () => {
  const mockRoot = { 
    absStartTime: 0, startTime: 0, duration: 10, 
    root: function() { return this },
  };

  test('default time', () => {
    const clip = new Clip({});
    clip.parent = mockRoot;
    expect(clip.absStartTime).toBe(0);
    expect(clip.startTime).toBe(0);
    expect(clip.duration).toBe(10);
    expect(clip.endTime).toBe(10);
  });
});
