let calcFPS = Boolean(localStorage.getItem("calc_fps") ?? "1");
const fpsEl = document.querySelector(".fps");

function fpsMeter() {
  let prevTime = Date.now();
  let frames = 0;

  requestAnimationFrame(function loop() {
    const time = Date.now();
    frames++;
    if (time > prevTime + 500) {
      let fps = Math.round( ( frames * 1000 ) / ( time - prevTime ) );
      prevTime = time;
      frames = 0;
      fpsEl.innerText = `FPS: ${fps}`;
    }

    if (calcFPS) requestAnimationFrame(loop);
  });
}

fpsMeter();