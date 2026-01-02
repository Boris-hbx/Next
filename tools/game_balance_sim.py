#!/usr/bin/env python3
"""
Tower Defense Game Balance Simulator v2
More realistic simulation with frame-by-frame combat
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import random
import math
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple

# ==================== Game Config ====================

@dataclass
class TowerConfig:
    name: str
    cost: int
    damage: float
    fire_rate: int  # frames between shots
    range: int
    special: str = ""

TOWERS = {
    "basic": TowerConfig("Basic", 50, 10, 60, 100),
    "slow": TowerConfig("Slow", 75, 5, 90, 80, "slow50%"),
    "splash": TowerConfig("Splash", 100, 8, 80, 90, "splash40"),
    "sniper": TowerConfig("Sniper", 150, 40, 150, 180),
}

@dataclass
class EnemyConfig:
    name: str
    hp: int
    speed: float
    reward: int

# Different balance configs
ENEMIES_ORIGINAL = {
    "basic": EnemyConfig("Bug", 30, 1.0, 10),
    "fast": EnemyConfig("Fast", 20, 2.0, 15),
    "tank": EnemyConfig("Tank", 100, 0.5, 30),
    "boss": EnemyConfig("Boss", 300, 0.3, 100),
}

ENEMIES_V2_HARD = {
    "basic": EnemyConfig("Bug", 80, 1.2, 8),
    "fast": EnemyConfig("Fast", 50, 2.5, 12),
    "tank": EnemyConfig("Tank", 250, 0.6, 25),
    "boss": EnemyConfig("Boss", 800, 0.4, 80),
}

# ==================== Realistic Simulator ====================

@dataclass
class Tower:
    type: str
    x: float
    y: float
    cooldown: int = 0
    kills: int = 0
    level: int = 0

    @property
    def config(self):
        return TOWERS[self.type]

    @property
    def damage(self):
        bonuses = [1.0, 1.2, 1.5, 2.0]
        return self.config.damage * bonuses[min(self.level, 3)]

    @property
    def range(self):
        return self.config.range

    def update_level(self):
        thresholds = [0, 5, 15, 30]
        for i in range(len(thresholds) - 1, -1, -1):
            if self.kills >= thresholds[i]:
                self.level = i
                break

@dataclass
class Enemy:
    type: str
    hp: float
    max_hp: float
    x: float
    y: float
    path_index: int = 0
    slow_timer: int = 0

    @property
    def is_alive(self):
        return self.hp > 0

# Path: simplified as a list of (x, y) points
# Based on actual game path: Classic map
DEFAULT_PATH = [
    (50, 250), (150, 250), (150, 150), (350, 150),
    (350, 350), (550, 350), (550, 250), (650, 250)
]

class RealisticSimulator:
    def __init__(self, enemy_config: Dict[str, EnemyConfig],
                 path: List[Tuple[float, float]] = None,
                 max_towers: int = 8):  # Allow more towers
        self.enemy_config = enemy_config
        self.path = path or DEFAULT_PATH
        self.max_towers = max_towers
        self.path_length = self._calc_path_length()

    def _calc_path_length(self) -> float:
        total = 0
        for i in range(1, len(self.path)):
            dx = self.path[i][0] - self.path[i-1][0]
            dy = self.path[i][1] - self.path[i-1][1]
            total += math.sqrt(dx*dx + dy*dy)
        return total

    def _get_tower_positions(self, count: int) -> List[Tuple[float, float]]:
        """Get good tower positions close to the path"""
        # Positions that are within range of multiple path segments
        positions = [
            (100, 200),   # Near start, covers horizontal segment
            (200, 200),   # Near corner 1
            (250, 100),   # Near horizontal segment at y=150
            (350, 250),   # Center, covers vertical segment
            (450, 300),   # Near corner 3
            (500, 400),   # Near horizontal at y=350
            (600, 300),   # Near end
            (550, 200),   # Near final segment
        ]
        return positions[:count]

    def get_wave_enemies(self, wave: int) -> List[str]:
        """Generate enemy types for a wave"""
        count = 3 + wave * 2
        enemies = []

        for i in range(count):
            enemy_type = "basic"
            rand = random.random()

            if wave >= 3 and rand < 0.25:
                enemy_type = "fast"
            if wave >= 5 and rand < 0.15:
                enemy_type = "tank"
            if wave == 10 and i == count - 1:
                enemy_type = "boss"

            enemies.append(enemy_type)
        return enemies

    def distance(self, x1, y1, x2, y2) -> float:
        return math.sqrt((x2-x1)**2 + (y2-y1)**2)

    def move_enemy(self, enemy: Enemy, speed_mult: float = 1.0) -> bool:
        """Move enemy along path. Returns True if reached end."""
        if enemy.path_index >= len(self.path) - 1:
            return True

        config = self.enemy_config[enemy.type]
        speed = config.speed * speed_mult

        # Apply slow effect
        if enemy.slow_timer > 0:
            speed *= 0.5
            enemy.slow_timer -= 1

        target = self.path[enemy.path_index + 1]
        dx = target[0] - enemy.x
        dy = target[1] - enemy.y
        dist = math.sqrt(dx*dx + dy*dy)

        if dist < speed:
            enemy.x = target[0]
            enemy.y = target[1]
            enemy.path_index += 1
        else:
            enemy.x += (dx / dist) * speed
            enemy.y += (dy / dist) * speed

        return enemy.path_index >= len(self.path) - 1

    def tower_attack(self, tower: Tower, enemies: List[Enemy]) -> Optional[Enemy]:
        """Tower attacks nearest enemy in range. Returns killed enemy or None."""
        if tower.cooldown > 0:
            tower.cooldown -= 1
            return None

        # Find nearest enemy in range
        target = None
        min_dist = float('inf')

        for enemy in enemies:
            if not enemy.is_alive:
                continue
            dist = self.distance(tower.x, tower.y, enemy.x, enemy.y)
            if dist <= tower.range and dist < min_dist:
                min_dist = dist
                target = enemy

        if target is None:
            return None

        # Attack
        tower.cooldown = tower.config.fire_rate
        target.hp -= tower.damage

        # Special effects
        if tower.config.special == "slow50%":
            target.slow_timer = 120

        if tower.config.special == "splash40":
            # Damage nearby enemies
            for enemy in enemies:
                if enemy != target and enemy.is_alive:
                    dist = self.distance(target.x, target.y, enemy.x, enemy.y)
                    if dist <= 40:
                        enemy.hp -= tower.damage * 0.5

        # Check if killed
        if target.hp <= 0:
            tower.kills += 1
            tower.update_level()
            return target

        return None

    def choose_tower(self, gold: int, tower_count: int, wave: int) -> Optional[str]:
        """AI strategy for buying towers"""
        if tower_count >= self.max_towers:
            return None

        affordable = [t for t, c in TOWERS.items() if c.cost <= gold]
        if not affordable:
            return None

        # Strategy: mix of tower types
        if tower_count < 2:
            return "basic" if "basic" in affordable else None
        elif tower_count < 3:
            if "splash" in affordable:
                return "splash"
            return "basic" if "basic" in affordable else None
        elif tower_count < 4:
            if "slow" in affordable:
                return "slow"
            return "basic" if "basic" in affordable else None
        else:
            priority = ["sniper", "splash", "basic"]
            for t in priority:
                if t in affordable:
                    return t
        return None

    def simulate_wave(self, wave: int, towers: List[Tower], debug: bool = False) -> Tuple[int, int, int]:
        """Simulate one wave. Returns (escaped, kills, gold_earned)"""
        enemy_types = self.get_wave_enemies(wave)
        enemies: List[Enemy] = []
        spawn_timer = 0
        spawn_index = 0
        kills = 0
        gold_earned = 0
        escaped = 0
        total_damage = 0

        # Run simulation frame by frame
        max_frames = 60 * 180  # 3 minutes max
        for frame in range(max_frames):
            # Spawn enemies
            if spawn_index < len(enemy_types):
                spawn_timer += 1
                if spawn_timer >= 40:  # Spawn every 40 frames
                    etype = enemy_types[spawn_index]
                    config = self.enemy_config[etype]
                    enemies.append(Enemy(
                        type=etype,
                        hp=config.hp,
                        max_hp=config.hp,
                        x=self.path[0][0],
                        y=self.path[0][1]
                    ))
                    spawn_index += 1
                    spawn_timer = 0

            # Move enemies
            for enemy in enemies:
                if not enemy.is_alive:
                    continue
                if self.move_enemy(enemy):
                    escaped += 1
                    enemy.hp = 0  # Mark as dead

            # Tower attacks
            for tower in towers:
                old_kills = tower.kills
                killed = self.tower_attack(tower, enemies)
                if killed:
                    kills += 1
                    gold_earned += self.enemy_config[killed.type].reward

            # Check if wave complete
            all_spawned = spawn_index >= len(enemy_types)
            all_dead = all(not e.is_alive for e in enemies)
            if all_spawned and all_dead:
                break

        if debug and wave == 1:
            print(f"  Wave {wave}: {len(enemy_types)} enemies, {len(towers)} towers")
            print(f"    Kills: {kills}, Escaped: {escaped}")
            for i, t in enumerate(towers):
                print(f"    Tower {i} at ({t.x},{t.y}): {t.kills} kills")

        return escaped, kills, gold_earned

    def run_game(self, num_waves: int = 10) -> dict:
        """Run full game simulation"""
        gold = 100
        lives = 10
        towers: List[Tower] = []
        total_kills = 0
        waves_survived = 0

        for wave in range(1, num_waves + 1):
            # Buy phase
            positions = self._get_tower_positions(self.max_towers)
            while True:
                tower_type = self.choose_tower(gold, len(towers), wave)
                if tower_type is None:
                    break
                cost = TOWERS[tower_type].cost
                if gold < cost:
                    break
                gold -= cost
                pos = positions[len(towers)]
                towers.append(Tower(tower_type, pos[0], pos[1]))

            # Combat phase
            escaped, kills, earned = self.simulate_wave(wave, towers)
            total_kills += kills
            gold += earned
            lives -= escaped

            if lives <= 0:
                break
            waves_survived = wave

        won = waves_survived >= num_waves and lives > 0
        return {
            "won": won,
            "waves": waves_survived,
            "lives": max(0, lives),
            "gold": gold,
            "towers": len(towers),
            "kills": total_kills
        }

def run_batch(enemy_config: Dict[str, EnemyConfig], runs: int = 100) -> dict:
    """Run multiple simulations"""
    results = []
    for _ in range(runs):
        sim = RealisticSimulator(enemy_config, max_towers=6)
        result = sim.run_game()
        results.append(result)

    wins = sum(1 for r in results if r["won"])
    avg_waves = sum(r["waves"] for r in results) / len(results)
    avg_lives = sum(r["lives"] for r in results if r["won"]) / max(wins, 1)

    return {
        "win_rate": wins / len(results),
        "avg_waves": avg_waves,
        "avg_lives": avg_lives,
        "runs": runs
    }

def find_balance():
    """Find balanced enemy configuration"""
    print("=" * 60)
    print("Tower Defense Balance Simulator v2")
    print("=" * 60)

    # Debug single run first
    print("\n[Debug: Single Run with ORIGINAL config]")
    sim = RealisticSimulator(ENEMIES_ORIGINAL, max_towers=8)
    # Manually set up and run with debug
    gold = 100
    towers = []
    positions = sim._get_tower_positions(8)
    # Buy initial towers
    gold -= 50
    towers.append(Tower("basic", positions[0][0], positions[0][1]))
    gold -= 50
    towers.append(Tower("basic", positions[1][0], positions[1][1]))
    print(f"  Starting with 2 basic towers, gold={gold}")
    escaped, kills, earned = sim.simulate_wave(1, towers, debug=True)
    print(f"  Wave 1 result: escaped={escaped}, kills={kills}, earned={earned}")

    print("\n[Testing ORIGINAL config (easy)]")
    r = run_batch(ENEMIES_ORIGINAL, 50)
    print(f"  Win: {r['win_rate']*100:.0f}%, Waves: {r['avg_waves']:.1f}, Lives: {r['avg_lives']:.1f}")

    print("\n[Testing V2_HARD config]")
    r = run_batch(ENEMIES_V2_HARD, 50)
    print(f"  Win: {r['win_rate']*100:.0f}%, Waves: {r['avg_waves']:.1f}, Lives: {r['avg_lives']:.1f}")

    print("\n" + "=" * 60)
    print("[Searching for Balanced Config]")
    print("Target: 70-85% win rate, 2-4 lives remaining")
    print("=" * 60)

    best = None
    best_score = 0

    # Test HP multipliers on base balanced config
    # Start from ORIGINAL as base and scale up
    base = {
        "basic": EnemyConfig("Bug", 30, 1.0, 10),
        "fast": EnemyConfig("Fast", 20, 2.0, 15),
        "tank": EnemyConfig("Tank", 100, 0.5, 30),
        "boss": EnemyConfig("Boss", 300, 0.3, 100),
    }

    for hp_mult in [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.2, 2.5]:
        test_cfg = {}
        for name, cfg in base.items():
            test_cfg[name] = EnemyConfig(
                cfg.name, int(cfg.hp * hp_mult), cfg.speed, cfg.reward
            )

        r = run_batch(test_cfg, 100)

        ideal = ""
        if 0.70 <= r['win_rate'] <= 0.85 and 2 <= r['avg_lives'] <= 4:
            ideal = " * IDEAL"

        score = 1 - abs(r['win_rate'] - 0.78) * 2 - abs(r['avg_lives'] - 3) / 20
        print(f"  HP x{hp_mult:.1f}: Win {r['win_rate']*100:5.1f}%, Lives {r['avg_lives']:.1f}{ideal}")

        if score > best_score:
            best_score = score
            best = (hp_mult, test_cfg)

    if best:
        hp_mult, cfg = best
        print(f"\n[RECOMMENDED: HP x{hp_mult:.1f}]")
        for name, c in cfg.items():
            print(f"  {name}: hp={c.hp}, speed={c.speed}, reward={c.reward}")

        # Generate JS
        print("\n[JS Code for game.html]")
        print("var ENEMY_TYPES = {")
        colors = {"basic": "#ef4444", "fast": "#fbbf24", "tank": "#7c3aed", "boss": "#dc2626"}
        sizes = {"basic": 12, "fast": 10, "tank": 18, "boss": 24}
        for name, c in cfg.items():
            print(f"    {name}: {{ id: '{name}', name: '{c.name}', hp: {c.hp}, speed: {c.speed}, "
                  f"reward: {c.reward}, color: '{colors.get(name, '#ef4444')}', "
                  f"size: {sizes.get(name, 12)}, label: '{c.name}' }},")
        print("};")

        return cfg

    return base

if __name__ == "__main__":
    find_balance()
