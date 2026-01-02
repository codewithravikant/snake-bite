// Basic NPC AI for single-player mode
const { GRID_WIDTH, GRID_HEIGHT } = require('./gameLogic');

function createNPC(playerId, name, difficulty = 'medium') {
  return {
    id: playerId,
    name: name,
    type: 'npc',
    difficulty: difficulty,
    targetFood: null,
    decisionDelay: 0
  };
}

function getDifficultySettings(difficulty) {
  const settings = {
    // Easy: Randomly wanders, chases food inefficiently, crashes often
    easy: {
      reactionDelayFrames: 10, // Slow reaction
      errorChance: 0.25,       // 25% chance to pick a random direction
      usePathfinding: false,   // Uses simple "hot/cold" logic
      safetyCheck: false       // Doesn't check if it's getting trapped
    },
    // Medium: Smart, finds food, but can be trapped
    medium: {
      reactionDelayFrames: 4,
      errorChance: 0.05,       // 5% chance to slip up
      usePathfinding: true,    // Uses BFS to find food
      safetyCheck: false       // Doesn't calculate future available space
    },
    // Hard: "Unbeatable" - Perfect pathfinding, trapped-space awareness
    hard: {
      reactionDelayFrames: 0,  // Instant reaction
      errorChance: 0.0,        // No mistakes
      usePathfinding: true,    // Uses BFS
      safetyCheck: true        // Uses Flood Fill to ensure it never enters a dead end
    }
  };
  return settings[difficulty] || settings.medium;
}

function decideNPCMove(npc, gameState, player) {
  if (!player.isAlive || !player.snake || player.snake.length === 0) {
    return null;
  }

  // Dynamic difficulty: Scale based on snake length (optional feature)
  // Easy bots become medium after length 20, medium become hard after length 30
  let effectiveDifficulty = npc.difficulty;
  if (player.snake.length > 20 && npc.difficulty === 'easy') {
    effectiveDifficulty = 'medium';
  } else if (player.snake.length > 30 && npc.difficulty === 'medium') {
    effectiveDifficulty = 'hard';
  }

  const settings = getDifficultySettings(effectiveDifficulty);

  // 1. Reaction Delay Logic
  if (npc.decisionDelay > 0) {
    npc.decisionDelay--;
    return null; // Keep moving in current direction
  }
  npc.decisionDelay = settings.reactionDelayFrames;

  const head = player.snake[0];
  const currentDir = player.direction;
  
  // 2. Identify Safe Moves immediately
  const possibleMoves = ['up', 'down', 'left', 'right'];
  let safeMoves = possibleMoves.filter(move => 
    isMoveImmediatelySafe(head, move, gameState, player.id)
  );

  // If no safe moves, we are dead. Return null.
  if (safeMoves.length === 0) return null;

  // 3. Error Chance (For Easy/Medium to make them beatable)
  if (Math.random() < settings.errorChance) {
    // Pick random safe move
    return safeMoves[Math.floor(Math.random() * safeMoves.length)];
  }

  // 4. "Unbeatable" Logic (Hard Mode) & Pathfinding (Medium Mode)
  if (settings.usePathfinding) {
    
    // A. Find shortest path to ANY food using BFS
    const pathResult = findPathToClosestFood(head, gameState, player.id);
    
    // If a path to food exists
    if (pathResult && safeMoves.includes(pathResult.firstMove)) {
      const bestMove = pathResult.firstMove;

      // HARD MODE: Safety Check (Flood Fill)
      // "If I take this step, will I eventually get trapped?"
      if (settings.safetyCheck) {
        // Calculate coordinate of the move
        const nextPos = getNextCoord(head, bestMove, gameState.wallMode);
        
        // Count how many tiles we can reach from that spot
        const availableSpace = countAccessibleTiles(nextPos, gameState, player.id, player.snake.length);
        
        // If available space is larger than our body, it's safe.
        // If not, following this path leads to death (even if we eat the food).
        if (availableSpace >= player.snake.length) {
          return bestMove;
        } 
        // If unsafe, fall through to survival mode below
      } else {
        // MEDIUM MODE: Limited space check (not full flood fill)
        // Check if this move leads to an obvious trap
        const nextPos = getNextCoord(head, bestMove, gameState.wallMode);
        const space = countAccessibleTiles(nextPos, gameState, player.id, 20);
        
        // Only take path if it doesn't lead to obvious trap
        if (space >= player.snake.length / 2) {
          return bestMove;
        }
        // Otherwise fall through to survival/fallback logic
      }
    }
    
    // B. Survival Mode (Stalling)
    // If no food is reachable OR the path to food is a trap:
    // Try to chase our own tail or move to the area with the most open space.
    if (settings.safetyCheck) {
      let bestSurvivalMove = null;
      let maxSpace = -1;

      // First, try to maximize space (existing logic)
      for (const move of safeMoves) {
        const nextPos = getNextCoord(head, move, gameState.wallMode);
        const space = countAccessibleTiles(nextPos, gameState, player.id, 100); // Check up to 100 tiles deep
        
        if (space > maxSpace) {
          maxSpace = space;
          bestSurvivalMove = move;
        }
      }
      
      // If we have enough space, use it
      if (maxSpace >= player.snake.length) {
        return bestSurvivalMove;
      }
      
      // Otherwise, try tail-chasing strategy (loop around)
      const tail = player.snake[player.snake.length - 1];
      if (tail) {
        // Find move that gets closer to tail (will move away, creating a loop)
        let closestToTail = null;
        let minTailDist = Infinity;
        
        for (const move of safeMoves) {
          const nextPos = getNextCoord(head, move, gameState.wallMode);
          let dx = Math.abs(tail.x - nextPos.x);
          let dy = Math.abs(tail.y - nextPos.y);
          
          if (!gameState.wallMode) {
            dx = Math.min(dx, GRID_WIDTH - dx);
            dy = Math.min(dy, GRID_HEIGHT - dy);
          }
          
          const dist = dx + dy;
          if (dist < minTailDist) {
            minTailDist = dist;
            closestToTail = move;
          }
        }
        
        if (closestToTail) {
          return closestToTail;
        }
      }
      
      return bestSurvivalMove; // Fallback
    }
  }

  // 5. Fallback Logic (Easy Mode / No Pathfinding)
  // Easy mode: Prefer straight movement (humans do this)
  if (!settings.usePathfinding && safeMoves.includes(currentDir)) {
    if (Math.random() < 0.6) {
      return currentDir;
    }
  }
  
  // Simple "Hot/Cold" logic
  let bestMove = safeMoves[0];
  let shortestDist = Infinity;

  // Find closest food via simple Manhattan distance
  let targetFood = gameState.food[0]; // Default
  if(gameState.food.length > 0) {
    // Find absolute closest food
    let minDist = Infinity;
    gameState.food.forEach(f => {
      const d = Math.abs(f.x - head.x) + Math.abs(f.y - head.y);
      if(d < minDist) { minDist = d; targetFood = f; }
    });
  }

  if (targetFood) {
    for (const move of safeMoves) {
      const nextPos = getNextCoord(head, move, gameState.wallMode);
      
      // Calculate wrapped distance if needed
      let dx = Math.abs(targetFood.x - nextPos.x);
      let dy = Math.abs(targetFood.y - nextPos.y);
      
      if (!gameState.wallMode) {
        dx = Math.min(dx, GRID_WIDTH - dx);
        dy = Math.min(dy, GRID_HEIGHT - dy);
      }
      
      const dist = dx + dy;
      if (dist < shortestDist) {
        shortestDist = dist;
        bestMove = move;
      }
    }
  }

  return bestMove;
}

// --- HELPER FUNCTIONS ---

// Check if a specific single move results in immediate death
function isMoveImmediatelySafe(head, direction, gameState, myId) {
  const nextPos = getNextCoord(head, direction, gameState.wallMode);
  
  // 1. Wall Collision
  if (gameState.wallMode) {
    if (nextPos.x < 0 || nextPos.x >= GRID_WIDTH || 
        nextPos.y < 0 || nextPos.y >= GRID_HEIGHT) {
      return false;
    }
  }

  // 2. Snake Collision (Self and Enemies)
  return !isOccupied(nextPos, gameState, myId); 
}

// Coordinate calculator handling Wrap/Wall modes
function getNextCoord(pos, direction, wallMode) {
  let { x, y } = pos;
  if (direction === 'up') y -= 1;
  else if (direction === 'down') y += 1;
  else if (direction === 'left') x -= 1;
  else if (direction === 'right') x += 1;

  if (wallMode) {
    // Return actual coord (can be out of bounds)
    return { x, y };
  } else {
    // Wrap coords
    return {
      x: (x + GRID_WIDTH) % GRID_WIDTH,
      y: (y + GRID_HEIGHT) % GRID_HEIGHT
    };
  }
}

// Check if a specific coordinate is occupied by ANY snake
function isOccupied(pos, gameState, myId = null) {
  // Check bounds for wall mode (redundant if called after isMoveImmediatelySafe but good for BFS)
  if (gameState.wallMode) {
    if (pos.x < 0 || pos.x >= GRID_WIDTH || pos.y < 0 || pos.y >= GRID_HEIGHT) return true;
  }

  // Check all players
  for (const player of Object.values(gameState.players)) {
    if (!player.isAlive) continue;
    
    // Treat snake body as obstacle
    // Note: We ignore the TAIL of snakes because it will move forward (unless they just ate)
    // For absolute safety in Hard mode, we treat tail as solid, for Medium we might ignore it.
    // Here we treat full body as solid for simplicity and safety.
    for (let i = 0; i < player.snake.length - 1; i++) { 
      // i < length - 1 effectively ignores the tail tip which will move away
      // However, if snake just ate, tail doesn't move. To be unbeatable, treat tail as wall.
      if (player.snake[i].x === pos.x && player.snake[i].y === pos.y) return true;
    }
    // Check tail tip specifically
    const tail = player.snake[player.snake.length - 1];
    if (tail.x === pos.x && tail.y === pos.y) return true;
  }
  return false;
}

// BFS to find the shortest path to the nearest food item
function findPathToClosestFood(startPos, gameState, myId) {
  const queue = [];
  // Store visited as string "x,y"
  const visited = new Set();
  
  // Format: { pos, firstMove }
  // We only need to know the 'firstMove' to take to start the journey
  
  // Init neighbors
  const moves = ['up', 'down', 'left', 'right'];
  for (const move of moves) {
    const next = getNextCoord(startPos, move, gameState.wallMode);
    if (!isOccupied(next, gameState, myId)) {
      queue.push({ pos: next, firstMove: move, dist: 1 });
      visited.add(`${next.x},${next.y}`);
    }
  }

  while (queue.length > 0) {
    const { pos, firstMove, dist } = queue.shift();

    // Check if this pos is food
    for (const food of gameState.food) {
      if (pos.x === food.x && pos.y === food.y) {
        return { firstMove, dist }; // Found shortest path!
      }
    }

    // Performance limit: Don't search entire board if food is far
    if (dist > 50) continue; 

    // Add neighbors
    for (const move of moves) {
      const next = getNextCoord(pos, move, gameState.wallMode);
      const key = `${next.x},${next.y}`;
      
      if (!visited.has(key) && !isOccupied(next, gameState, myId)) {
        visited.add(key);
        queue.push({ pos: next, firstMove, dist: dist + 1 });
      }
    }
  }
  
  return null; // No path to food
}

// Flood Fill to count reachable tiles (Space Awareness)
function countAccessibleTiles(startPos, gameState, myId, limit = 50) {
  const stack = [startPos];
  const visited = new Set();
  visited.add(`${startPos.x},${startPos.y}`);
  let count = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    count++;
    
    if (count >= limit) return limit; // Optimisation: If we have enough space, stop counting

    const moves = ['up', 'down', 'left', 'right'];
    for (const move of moves) {
      const next = getNextCoord(current, move, gameState.wallMode);
      const key = `${next.x},${next.y}`;

      if (!visited.has(key) && !isOccupied(next, gameState, myId)) {
        visited.add(key);
        stack.push(next);
      }
    }
  }
  return count;
}

function processNPCInputs(gameState, npcs) {
  Object.values(gameState.players).forEach(player => {
    if (player.type !== 'npc' || !player.isAlive) return;

    const npc = npcs.get(player.id);
    if (!npc) return;

    const direction = decideNPCMove(npc, gameState, player);
    
    // Validate direction change (cannot reverse)
    if (direction) {
      const opposites = { 'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left' };
      if (opposites[direction] !== player.direction) {
        player.nextDirection = direction;
      }
    }
  });
}

module.exports = {
  createNPC,
  processNPCInputs,
  getDifficultySettings
};