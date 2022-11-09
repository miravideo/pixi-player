import React, { Component } from "react";
import { observer } from 'mobx-react-lite';
import styled from 'styled-components';
import { useLayer } from "react-laag";
import Utils from "./utils";

const Container = styled.div`
  position: relative;
  max-width: 100%;
  width: 100%;
  height: 100%;
  outline: 0px solid transparent;
  overflow: hidden;
  padding: 0px;
  margin: 0px;
  user-select:none;
  -webkit-user-select: none;
  background: rgba(0,0,0,0.3);

  * { // reset
    cursor: default;
    border-radius: 0;
    border: 0;
    padding: 0px;
    margin: 0px;
    user-select: none;
    -webkit-user-select: none;
    font-family: Helvetica, Arial;
  }

  ::before {
    border: 0;
    margin: 0;
    padding: 0;
    font-family: Helvetica, Arial;
  }

  ::after {
    border: 0;
    margin: 0;
    padding: 0;
    font-family: Helvetica, Arial;
  }
`;

const Background = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
`;

const Canvas = styled.canvas`

`;

const Toast = styled.div`
white-space: pre-wrap;
color: #FFF;
text-align: center;
position: absolute;
display: flex;
align-items: center;
justify-content: center;
margin-left: -50%;
width: 100%;
height: 60px;
left: 50%;
top: 0;
opacity: 1;
transition-property: top opacity;
transition-duration: 0.3;

&.hide {
  pointer-events: none;
  top: -20px;
  opacity: 0;
  transition-property: top opacity;
  transition-duration: 0.3;
}

span {
  background: rgba(30, 30, 30, 0.8);
  padding: 5px 8px;
  border-radius: 3px;
  font-size: 12px;
  max-width: 95%;
  word-break: break-all;
}
`;

const LoadingContainer = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: default;
  transition: background-color 0.3;

  span {
    position: absolute;
    display: block;
    color: white;
    font-size: 16px;

    &:after {
      display: inline-block;
      content: "%";
      font-size: 12px;
      margin-left: -1px;
      transform: scale(0.7) translateY(1px);
    }
  }

  svg {
    transform: rotateZ(-90deg);

    circle {
      stroke: rgba(255, 255, 255, 0.3);
      stroke-width: 2px;
    }

    .loading-bar {
      stroke: white;
      stroke-width: 2.5px;
    }
  }

  button {
    cursor: pointer;
    font-family: Helvertica;
    position: absolute;
    padding-bottom: 5px;
    width: 50px;
    height: 50px;
    color: #F00;
    background-color: rgba(0, 0, 0, 0.8);
    border: 0px;
    border-radius: 50%;
    line-height: 25px;
    font-size: 25px;
    opacity: 0;

    &:hover {
      opacity: 1.0;
    }
  }
`;

const Loading = observer(({store}) => {
  const pr = 27;
  return (
    <LoadingContainer>
      <svg width="60" height="60" viewport="0 0 60 60" version="1.1" xmlns="http://www.w3.org/2000/svg">
        <circle cx="30" cy="30" fill="transparent"
          r={pr} strokeDasharray={Math.PI*2*pr} 
          strokeDashoffset={0}></circle>
        <circle className="loading-bar" cx="30" cy="30" fill="transparent"
          r={pr} strokeDasharray={Math.PI*2*pr} 
          strokeDashoffset={(1-store.loadingProgress)*Math.PI*2*pr}></circle>
      </svg>
      <span>{(100*store.loadingProgress).toFixed(1)}</span>
      <button onClick={() => store.cancelLoading()}>×</button>
    </LoadingContainer>
  );
});

const ControlsBackground = styled.div`
  background: linear-gradient(rgba(0,0,0,0), rgba(0,0,0,1));
  visibility: visible;
  position: absolute;
  bottom: 0px;
  left: 0px;
  width: 100%;
  height: 80px;
  transition: opacity 0.3s;
  pointer-events: none;

  .play-button {
    background-image: url("data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='20' height='20' viewBox='0 0 48 48' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M15 24V11.8756L25.5 17.9378L36 24L25.5 30.0622L15 36.1244V24Z' fill='%23FFF' stroke='%23FFF' stroke-width='2' stroke-linejoin='round'/%3E%3C/svg%3E");
  }

  .pause-button {
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 1024 1024' version='1.1' xmlns='http://www.w3.org/2000/svg' p-id='6783' width='20' height='20'%3E%3Cpath d='M428.539658 833.494155c0 15.954367-13.053294 29.007661-29.007661 29.007661L285.613458 862.501816c-15.954367 0-29.007661-13.053294-29.007661-29.007661l0-639.423111c0-15.954367 13.053294-29.007661 29.007661-29.007661l113.918539 0c15.954367 0 29.007661 13.053294 29.007661 29.007661L428.539658 833.494155z' p-id='6784' fill='%23ffffff'%3E%3C/path%3E%3Cpath d='M760.124635 833.494155c0 15.954367-13.053294 29.007661-29.007661 29.007661l-113.918539 0c-15.954367 0-29.007661-13.053294-29.007661-29.007661l0-639.423111c0-15.954367 13.053294-29.007661 29.007661-29.007661l113.918539 0c15.954367 0 29.007661 13.053294 29.007661 29.007661L760.124635 833.494155z' p-id='6785' fill='%23ffffff'%3E%3C/path%3E%3C/svg%3E");
  }

  .export-button {
    background-image: url("data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='20' height='20' viewBox='0 0 48 48' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M23.9999 29.0001L12 17.0001L19.9999 17.0001L19.9999 6.00011L27.9999 6.00011L27.9999 17.0001L35.9999 17.0001L23.9999 29.0001Z' fill='%23FFF' stroke='%23FFF' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M42 37L6 37' stroke='%23FFF' stroke-width='3' stroke-linecap='round'/%3E%3Cpath d='M34 44H14' stroke='%23FFF' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E");
  }

  .more-button {
    background-image: url("data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='20' height='20' viewBox='0 0 48 48' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='24' cy='10' r='4' fill='%23FFF'/%3E%3Ccircle cx='24' cy='24' r='4' fill='%23FFF'/%3E%3Ccircle cx='24' cy='38' r='4' fill='%23FFF'/%3E%3C/svg%3E");
  }

  .sound-on-button {
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 1024 1024' version='1.1' xmlns='http://www.w3.org/2000/svg' p-id='2544' width='20' height='20'%3E%3Cpath d='M469.333333 106.666667v810.666666a21.333333 21.333333 0 0 1-36.42 15.086667L225.833333 725.333333H53.333333a53.393333 53.393333 0 0 1-53.333333-53.333333V352a53.393333 53.393333 0 0 1 53.333333-53.333333h172.5l207.08-207.086667A21.333333 21.333333 0 0 1 469.333333 106.666667z m146.793334 296.2a21.333333 21.333333 0 0 0-3.526667 29.96 127.366667 127.366667 0 0 1 0 158.346666 21.333333 21.333333 0 0 0 33.493333 26.433334 170.733333 170.733333 0 0 0 0-211.213334 21.333333 21.333333 0 0 0-29.966666-3.526666zM853.333333 512a340.32 340.32 0 0 0-100-241.333333 346.585333 346.585333 0 0 0-22.046666-20.213334 21.333333 21.333333 0 1 0-27.446667 32.666667c6.666667 5.586667 13.146667 11.553333 19.333333 17.726667C779.6 357.22 810.666667 432.22 810.666667 512s-31.066667 154.78-87.48 211.186667c-6.173333 6.173333-12.666667 12.14-19.333334 17.726666a21.333333 21.333333 0 1 0 27.446667 32.666667 346.585333 346.585333 0 0 0 22.046667-20.213333 340.32 340.32 0 0 0 100-241.333334z m133.173334-192.666667a508.806667 508.806667 0 0 0-112.466667-169.386666 518.346667 518.346667 0 0 0-57.533333-49.653334 21.333333 21.333333 0 0 0-25.42 34.273334 474.246667 474.246667 0 0 1 52.78 45.553333c182.993333 182.993333 182.993333 480.74 0 663.733333a474.853333 474.853333 0 0 1-52.78 45.553334 21.333333 21.333333 0 0 0 25.413333 34.273333 519.026667 519.026667 0 0 0 57.54-49.653333 512.546667 512.546667 0 0 0 112.466667-554.666667z' fill='%23ffffff' p-id='2545'%3E%3C/path%3E%3C/svg%3E");
  }

  .sound-off-button {
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 1024 1024' version='1.1' xmlns='http://www.w3.org/2000/svg' p-id='5474' width='20' height='20'%3E%3Cpath d='M469.333333 106.666667v810.666666a21.333333 21.333333 0 0 1-36.42 15.086667L225.833333 725.333333H53.333333a53.393333 53.393333 0 0 1-53.333333-53.333333V352a53.393333 53.393333 0 0 1 53.333333-53.333333h172.5l207.08-207.086667A21.333333 21.333333 0 0 1 469.333333 106.666667z m548.42 612.42a21.333333 21.333333 0 0 0 0-30.173334L840.833333 512l176.92-176.913333a21.333333 21.333333 0 1 0-30.173333-30.173334L810.666667 481.833333 633.753333 304.913333a21.333333 21.333333 0 0 0-30.173333 30.173334L780.5 512l-176.92 176.913333a21.333333 21.333333 0 0 0 30.173333 30.173334L810.666667 542.166667l176.913333 176.92a21.333333 21.333333 0 0 0 30.173333 0z' fill='%23ffffff' p-id='5475'%3E%3C/path%3E%3C/svg%3E");
  }
`;

const Buttons = styled.div`
  margin: 10px 3px 0px 3px;
  display: flex;
  pointer-events: auto;
`;

const Button = styled.div`
  width: 35px;
  height: 35px;
  margin: 5px;

  background-position: center;
  background-repeat: no-repeat;
  cursor: pointer;
  border-radius: 50%;
  transition: background 0.2s;

  &:hover {
    background-color: rgba(30, 30, 30, 0.7);
  }
`;

const TimeBar = styled.div`
  width: 100%;
  height: 25px;
  position: relative;
  cursor: pointer;
  margin-top: -5px;
  padding-top: 5px;
  pointer-events: auto;
`;

const ProgressBackground = styled.div`
  position: absolute;
  height: 4px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
  left: 17px;
  right: 17px;
  pointer-events: none;
`;

const ProgressHandlerTrack = styled.div`
  position: absolute;
  height: 0px;
  left: 6px;
  right: 6px;
`;

const ProgressBar = styled.div`
  position: absolute;
  height: 4px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 2px;
  left: -6px;
  right: -6px;
`;

const ProgressHandler = styled.div`
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 1);
  transform: translate(-6px, -4px);
  transition: opacity 0.3s;
`;

const Time = styled.div`
  color: white;
  font-size: 14px;
  font-weight: 350;
  font-family: Noto Sans,Helvetica Neue,Helvetica,PingFang SC!important;
  line-height: 45px;
  white-space: nowrap;
`;

const Space = styled.div`
  flex-grow: 1;
`;


const MenuItem = styled.div`
color: rgba(0, 0, 0, 0.9);
cursor: pointer;
width: 200px;
height: 35px;
font-size: 14px;
line-height: 35px;
font-weight: 350;
padding: 2px 10px;
  :hover {
    background-color: #E0E0E0;
  }
  label {
    font-size: 14px;
    font-weight: 300;
    float: right;
    opacity: 0.65;
    color: rgba(0, 0, 0, 0.9);
  }
`;

const MenuSepLine = styled.div`
width: 100%;
height: 1px;
background-color: #f1f1f1;
margin: 3px 0px;
`;

const Menu = styled.div`
box-shadow: 1px 2px 5px 2px rgb(51 51 51 / 15%);
background-color: white;
font-family: 'Lato', 'Source Sans Pro', Roboto, Helvetica, Arial, sans-serif;
-webkit-font-smoothing: antialiased;
z-index: 9999;
border-radius: 2px;
overflow: hidden;
`;

const Row = styled.div``;

const Controls = observer(({store}) => {
  let barRef = React.createRef();
  const moveOnTimer = (e, force=false) => {
    if (force || store._seek) {
      const { width } = Utils.innerSize(barRef.current);
      const p = (e.nativeEvent.offsetX - 23) / width;
      store.setTimePercent(Math.min(Math.max(p, 0), 1));
    }
  }

  const timePercent = `${(store.timePercent * 100).toFixed(2)}%`;
  const timeOffset = store.timePercent > 0 ? (store.timePercent < 1 ? '6px' : '12px') : '0px';

  const { renderLayer, triggerProps, layerProps } = useLayer({
    isOpen: store.showMenu !== undefined,
    triggerOffset: -35,
    onOutsideClick: () => { store.menuHide() },
    onDisappear: () => { store.menuHide() },
    placement: "top-end",
    auto: false,
  });

  return (
    <ControlsBackground style={{opacity: store.controlShow ? 1 : 0}}>
      <Buttons>
        <Button className={store.playing ? 'pause-button' : 'play-button'} 
          onClick={(e) => store.togglePlay()}></Button>
        { !store.canvasStyle || store.canvasStyle.width < 200 ? null :
          <Time>{Utils.formatTime(store.currentTime)} / {Utils.formatTime(store.duration)}</Time>
        }
        <Space></Space>
        { !store.canvasStyle.width || store.canvasStyle.width < 250 ? null :
          <Button className={store.muted ? 'sound-off-button' : 'sound-on-button'} onClick={() => store.toggleMute()}></Button>
        }
        { !store.canvasStyle.width || store.canvasStyle.width < 300 ? null :
          <Button className="export-button" onClick={() => store.export()}></Button>
        }
        { store.hideMenuButton ? null : 
          <Button className="more-button" {...triggerProps} onClick={() => store.menuShow()}></Button>
        }
      </Buttons>
      <TimeBar onMouseOver={() => store.showHandler(true)} onMouseOut={() => store.showHandler(false)}
          onMouseDown={() => store.onSeeking(true)} onMouseUp={() => store.onSeeking(false)}
          onMouseMove={(e) => moveOnTimer(e)} onClick={(e) => moveOnTimer(e, true)}>
        <ProgressBackground>
          <ProgressHandlerTrack ref={barRef}>
            <ProgressBar style={{width: `calc(${timePercent} + ${timeOffset})`}}></ProgressBar>
            <ProgressHandler style={{left: timePercent, opacity: store.timeHandlerShow ? 1 : 0}}></ProgressHandler>
          </ProgressHandlerTrack>
        </ProgressBackground>
      </TimeBar>
      {store.showMenu !== undefined &&
      renderLayer(
        <Menu
          {...layerProps} 
          style={{ ...layerProps.style }}>
          {store.showMenu.items.map((item, i) => (
            <Row key={`a${i}`}>
              {typeof(item) === 'string' ? (
              <MenuSepLine></MenuSepLine>
              ) : (
              <MenuItem onClick={() => {
                item.action && item.action();
                store.menuHide();
              }}>
                {item.title}
                {item.desc ? (<label>{item.desc}</label>) : ''}
              </MenuItem>
              )}
            </Row>
          ))}
        </Menu>
      )}
    </ControlsBackground>
  );
});

export const App = observer(({store}) => {
  return (
    <Container ref={store.containerRef} tabIndex="-1" 
      onKeyDown={(e) => store.keyDown(e)} onKeyUp={(e) => store.keyUp(e)}
      onMouseOver={() => store.showControls(true)} onMouseOut={() => store.showControls(false)}>
      <Background onClick={() => store.togglePlay()}>
        <Canvas style={store.canvasStyle} ref={store.canvasRef}/>
      </Background>
      <Toast className={store.toastHide ? 'hide' : ''}><span>{store.toastMsg}</span></Toast>
      <Controls store={store}></Controls>
      {
        !store.loading ? null :
        <Loading store={store}></Loading>
      }
    </Container>
  );
});