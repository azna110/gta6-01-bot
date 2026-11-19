// Screenshot scenes behind ?shot=chase|drive|mission|start. Each one stages a real
// moment of play — the same code the player runs, just placed on the spot — so a
// screenshot is always an honest frame of the game.
export function applyShot(game, name) {
  const g = game;
  if (name === 'start') {
    // menu stays up; park the camera on a high view of downtown for the backdrop
    g.state = 'menu';
    g.player.x = 0; g.player.z = 120; g.player.camYaw = Math.PI; g.player.camPitch = 0.5;
    g.player.model.position.set(0, 0, 120);
    return;
  }
  g.state = 'playing';
  g.hideMenus();
  g.hud.show();
  g.missions.active = true;
  if (name === 'drive' || name === 'chase') {
    // Vex in a car with traffic around her; the chase adds three cruisers and heat
    const startX = name === 'drive' ? -120 : 40;
    const startZ = name === 'drive' ? 280 : 200;
    const heading = name === 'drive' ? Math.PI / 2 : Math.PI;
    const car = g.traffic.nearestStealable(startX, startZ, 400) || g.traffic.cars[0];
    g.enterCar(car);
    g.playerCar.car.x = startX; g.playerCar.car.z = startZ; g.playerCar.car.heading = heading;
    g.playerCar.car.speed = name === 'chase' ? 26 : 15;
    g.player.camYaw = heading + Math.PI;
    g.missions.index = 1; g.missions.step = 1; // mid "Pickup": deliver the car
    // keep the throttle open in shot mode so the car is still rolling at capture
    g.driveInput = { axis: (n, p) => (p === 'KeyW' ? 1 : 0), down: () => false, wasPressed: () => false, consumeMouse: () => ({ dx: 0, dy: 0 }), consumeClick: () => false, endFrame: () => {} };
    // pull a few traffic cars onto the same road so the street feels alive
    const road = name === 'drive' ? 280 : 40;
    const movers = g.traffic.cars.filter((c) => !c.parked && !c.driven).slice(0, 3);
    movers.forEach((c, i) => {
      if (name === 'drive') { c.axis = 'x'; c.fixed = road; c.along = startX + 40 + i * 55; c.dir = 1; }
      else { c.axis = 'z'; c.fixed = road; c.along = startZ - 60 - i * 45; c.dir = -1; }
      c.speed = 10;
    });
    if (name === 'chase') {
      g.police.wanted = 3; g.police.quietTimer = 0;
      g.police.spawnCruiser(40, 150); g.police.spawnCruiser(52, 230); g.police.spawnCruiser(28, 240);
    }
  } else if (name === 'mission') {
    // on foot at the pier, facing the beacon and the boats beyond it
    g.missions.index = 0; g.missions.step = 0;
    g.player.x = 20; g.player.z = 300; g.player.heading = -0.34;
    g.player.camYaw = 2.8; g.player.camPitch = 0.28;
    g.player.model.position.set(20, 0, 300);
    g.cash = 150;
  }
  // let traffic and pedestrians settle for a few simulated seconds
  for (let i = 0; i < 240; i++) {
    g.traffic.update(1 / 60, g.playerCar, null);
    g.pedestrians.update(1 / 60);
  }
  if (g.playerCar) {
    g.playerCar.car.model.position.set(g.playerCar.car.x, 0, g.playerCar.car.z);
    g.playerCar.car.model.rotation.y = g.playerCar.car.heading;
  }
}
