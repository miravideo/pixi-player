
import Clip from '@/core/clip';
import KeyFrames from '../../src/util/keyframe';

describe('animation/keyframe', () => {
  const mockRoot = { 
    player: { currentTime: 1 }, 
    absStartTime: 0, startTime: 0, duration: 10, 
    width: 720, height: 1280,
    root: function() { return this },
  };

  let kf, kfs, attrs;

  test('keyframe attr calc', () => {
    const clip = new Clip({});
    clip.parent = mockRoot;

    kf = new KeyFrames([
      { time: 1, x: 100 },
      { time: 1, y: 150 },
      { time: 2, x: 200, y: 250 }
    ]);

    expect(kf.renderAttr(0, clip).x).toBe(100);
    expect(kf.renderAttr(0, clip).y).toBe(150);
    expect(kf.renderAttr(1, clip).x).toBe(100);
    expect(kf.renderAttr(1, clip).y).toBe(150);
    expect(kf.renderAttr(1.5, clip).x).toBe(150);
    expect(kf.renderAttr(1.5, clip).y).toBe(200);
    expect(kf.renderAttr(2, clip).x).toBe(200);
    expect(kf.renderAttr(2, clip).y).toBe(250);
    expect(kf.renderAttr(3, clip).x).toBe(200);
    expect(kf.renderAttr(3, clip).y).toBe(250);

    kf = new KeyFrames(clip.px([
      { time: 1, x: '50vw' },
      { time: 3, x: '80vw' }, // test should re-sort
      { time: 2, x: '70vw' },
    ]));

    expect(kf.renderAttr(0, clip).x).toBe(clip.px('50vw'));
    expect(kf.renderAttr(1, clip).x).toBe(clip.px('50vw'));
    expect(kf.renderAttr(1.1, clip).x).toBe(clip.px('52vw'));
    expect(kf.renderAttr(1.5, clip).x).toBe(clip.px('60vw'));
    expect(kf.renderAttr(2, clip).x).toBe(clip.px('70vw'));
    expect(kf.renderAttr(2.5, clip).x).toBe(clip.px('75vw'));
    expect(kf.renderAttr(3, clip).x).toBe(clip.px('80vw'));
  });

  test('add keyframe', () => {
    const clip = new Clip({});
    clip.parent = mockRoot;

    kfs = clip.setKeyFrame({'x': '50vw', 'y': '50vh'});
    expect(kfs.length).toBe(1);
    expect(kfs[0].time).toBe('1.00');
    expect(kfs[0].x).toBe('50vw');
    expect(kfs[0].y).toBe('50vh');

    // add kfs[1] and remove key [x] from kfs[0]
    kfs = clip.setKeyFrame({'x': '20vw'});
    expect(kfs.length).toBe(2);
    expect(kfs[0].x).toBe(undefined);
    expect(kfs[0].y).toBe('50vh');
    expect(kfs[1].x).toBe('20vw');
    expect(kfs[1].y).toBe(undefined);

    // remove key [y] from kfs[0] and remove kfs[0] since it's empty now
    kfs = clip.setKeyFrame({'y': '30vh'});
    expect(kfs.length).toBe(2);
    expect(kfs[0].x).toBe('20vw');
    expect(kfs[0].y).toBe(undefined);
    expect(kfs[1].x).toBe(undefined);
    expect(kfs[1].y).toBe('30vh');

    // add keyframe as time change into 2
    kfs = clip.setKeyFrame({'x': '50vw', 'y': '50vh'}, 2);
    expect(kfs.length).toBe(3);
    expect(kfs[2].time).toBe('2.00');
    expect(kfs[2].x).toBe('50vw');
    expect(kfs[2].y).toBe('50vh');

    attrs = clip.animationAttr(1);
    expect(attrs.x).toBe(clip.px('20vw'));
    expect(attrs.y).toBe(clip.px('30vh'));

    attrs = clip.animationAttr(1.5);
    expect(attrs.x).toBe(clip.px('35vw')); // half of 20 -> 50
    expect(attrs.y).toBe(clip.px('40vh')); // half of 30 -> 50
  });

  test('add keyframe by setConf', () => {
    const clip = new Clip({});
    clip.parent = mockRoot;

    kfs = clip.setKeyFrame({'x': '50vw', 'y': '50vh'});
    expect(kfs.length).toBe(1);
    expect(kfs[0].time).toBe('1.00');
    expect(kfs[0].x).toBe('50vw');
    expect(kfs[0].y).toBe('50vh');

    // change
    kfs = clip.setConf('x', '30vw');
    expect(kfs.length).toBe(2);
    expect(kfs[0].time).toBe('1.00');
    expect(kfs[0].x).toBe(undefined);
    expect(kfs[0].y).toBe('50vh');
    expect(kfs[1].time).toBe('1.00');
    expect(kfs[1].x).toBe('30vw');
    expect(kfs[1].y).toBe(undefined);

    // add keyframe
    clip.player.currentTime = 2;
    kfs = clip.setConf('x', '20vw');
    expect(kfs.length).toBe(3);
    expect(kfs[0].time).toBe('1.00');
    expect(kfs[0].x).toBe(undefined);
    expect(kfs[0].y).toBe('50vh');
    expect(kfs[1].time).toBe('1.00');
    expect(kfs[1].x).toBe('30vw');
    expect(kfs[1].y).toBe(undefined);
    expect(kfs[2].time).toBe('2.00');
    expect(kfs[2].x).toBe('20vw');
    expect(kfs[2].y).toBe(undefined);

    kfs = clip.setConf('y', '80vh');
    expect(kfs.length).toBe(4);

    attrs = clip.animationAttr(1.5);
    expect(attrs.x).toBe(clip.px('25vw')); // half of 30 -> 20
    expect(attrs.y).toBe(clip.px('65vh')); // half of 50 -> 80
  });
});
