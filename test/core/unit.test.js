
import Clip from '@/core/clip';

describe('unit', () => {
  const mockRoot = { 
    player: { currentTime: 1 }, 
    absStartTime: 0, startTime: 0, duration: 10, 
    width: 720, height: 1280,
    root: function() { return this },
  };
  const clip = new Clip({});
  clip.parent = mockRoot;
  let data;

  test('deunit', () => {
    data = clip.deunit('50');
    expect(data[0]).toBe(50);
    expect(data[1]).toBe(null);

    data = clip.deunit('360rpx');
    expect(data[0]).toBe(360 * (mockRoot.width / 360));
    expect(data[1]).toBe('rpx');

    data = clip.deunit('50rpx');
    expect(data[0]).toBe(50 * (mockRoot.width / 360));
    expect(data[1]).toBe('rpx');

    data = clip.deunit('50vw');
    expect(data[0]).toBe(0.5 * mockRoot.width);
    expect(data[1]).toBe('vw');

    data = clip.deunit('30vh');
    expect(data[0]).toBe(0.3 * mockRoot.height);
    expect(data[1]).toBe('vh');
  });

  test('enunit', () => {
    expect(clip.enunit(50, null)).toBe(50);
    expect(clip.enunit(50, 'rpx')).toBe('25rpx');
    expect(clip.enunit(360, 'vw')).toBe('50vw');
    // toFixed(3)
    expect(clip.enunit(100, 'vw')).toBe('13.889vw');
    expect(clip.enunit(50, 'vh')).toBe('3.906vh');
  });

  test('px', () => {
    expect(clip.px('50')).toBe(50);
    expect(clip.px('300rpx')).toBe(300 * (mockRoot.width / 360));
    expect(clip.px('10vw')).toBe(0.1 * mockRoot.width);

    const dict = clip.px({ x: '10rpx', y: '20rpx' });
    expect(dict.x).toBe(10 * (mockRoot.width / 360));
    expect(dict.y).toBe(20 * (mockRoot.width / 360));

    const ndict = clip.px({ 
      pos: { x: '10rpx', y: '20rpx' }, 
      size: { width: '20vw', height: '30vh' }
    });
    expect(ndict.pos.x).toBe(10 * (mockRoot.width / 360));
    expect(ndict.pos.y).toBe(20 * (mockRoot.width / 360));
    expect(ndict.size.width).toBe(mockRoot.width * 0.2);
    expect(ndict.size.height).toBe(mockRoot.height * 0.3);

    const adict = clip.px([
      { width: '10vw', height: '10vh' },
      { width: '30vw', height: '30vh' }
    ]);
    expect(adict[0].width).toBe(mockRoot.width * 0.1);
    expect(adict[0].height).toBe(mockRoot.height * 0.1);
    expect(adict[1].width).toBe(mockRoot.width * 0.3);
    expect(adict[1].height).toBe(mockRoot.height * 0.3);

    const nadict = clip.px({
      arr: [
        { width: '10vw', height: '10vh' },
        { width: '30vw', height: '30vh' }
      ]
    });
    expect(nadict.arr[0].width).toBe(mockRoot.width * 0.1);
    expect(nadict.arr[0].height).toBe(mockRoot.height * 0.1);
    expect(nadict.arr[1].width).toBe(mockRoot.width * 0.3);
    expect(nadict.arr[1].height).toBe(mockRoot.height * 0.3);
  });

  test('vu', () => {
    // x - default 50vw
    expect(clip.vu('x', 100)).toBe('13.889vw');
    // keep unit as set if it not null
    expect(clip.vu('x', '100rpx')).toBe('100rpx');
    expect(clip.vu('x', '100vw')).toBe('100vw');

    // y - default 50vh
    expect(clip.vu('y', 50)).toBe('3.906vh');

    clip.conf.y = '50rpx'; // change unit into rpx
    expect(clip.vu('y', 50)).toBe('25rpx');

    clip.conf.test_size = { width: '100vw', height: '100vh' };
    data = clip.vu('test_size', { width: 100, height: 50 });
    expect(data.width).toBe('13.889vw');
    expect(data.height).toBe('3.906vh');

  });
});
