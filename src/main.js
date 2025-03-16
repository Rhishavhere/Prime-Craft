import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';
import { createNoise2D } from 'simplex-noise';

// Block types with merged geometries
const BLOCK_TYPES = {
    dirt: { color: 0x8b4513, geometry: null, material: null },
    stone: { color: 0x808080, geometry: null, material: null },
    grass: { color: 0x567d46, geometry: null, material: null },
    bedrock: { color: 0x333333, geometry: null, material: null }
};

// Terrain generation constants
const TERRAIN_SIZE = 40; // Size of the world (blocks)
const NOISE_SCALE = 50; // Scale of the noise (higher = smoother)
const HEIGHT_SCALE = 10; // Maximum height of terrain
const HEIGHT_OFFSET = 2; // Minimum height of terrain
const STONE_THRESHOLD = 0.3; // Height threshold for stone generation
const CAVE_SCALE = 15; // Scale of cave noise
const CAVE_THRESHOLD = 0.7; // Threshold for cave generation

// Game state
const state = {
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    canJump: true,
    jumpCooldown: 0, // Add jump cooldown timer
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    prevTime: performance.now(),
    blocks: [], // Store all blocks for collision detection
    targetHeight: 1.6, // Target height for smooth transitions
    selectedBlock: null, // Currently looked-at block
    selectedBlockFace: null, // Face of the block being looked at
    currentBlockType: 'dirt' // Currently selected block type
};

// Physics constants
const GRAVITY = 30;
const JUMP_FORCE = 12; // Increased jump force
const MOVE_SPEED = 6;
const DAMPING = 0.9; // Friction
const PLAYER_HEIGHT = 1.6; // Typical Minecraft player height
const GROUND_LEVEL = 0; // Ground level position
const MAX_FALL_SPEED = 50; // Maximum falling speed
const HEIGHT_TRANSITION_SPEED = 10; // Speed of height adjustment
const JUMP_COOLDOWN = 0.2; // Add cooldown to prevent double jumps

// Spatial partitioning
const CHUNK_SIZE = 16;
const chunks = new Map(); // Map of chunk coordinates to arrays of blocks

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky blue

// Camera setup
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(TERRAIN_SIZE / 2, HEIGHT_SCALE + 2, TERRAIN_SIZE / 2);

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Controls setup
const controls = new PointerLockControls(camera, document.body);

// Raycaster setup
const raycaster = new THREE.Raycaster();
const maxReach = 5; // Maximum distance to interact with blocks

// Create block selection outline
const selectionGeometry = new THREE.BoxGeometry(1.001, 1.001, 1.001);
const selectionEdges = new THREE.EdgesGeometry(selectionGeometry);
const selectionOutline = new THREE.LineSegments(
    selectionEdges,
    new THREE.LineBasicMaterial({ color: 0xffffff })
);
selectionOutline.visible = false;
scene.add(selectionOutline);

// Add basic lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 5);
scene.add(directionalLight);

// Initialize merged geometries
function initBlockGeometries() {
    const baseGeometry = new THREE.BoxGeometry(1, 1, 1);
    
    for (const type in BLOCK_TYPES) {
        BLOCK_TYPES[type].material = new THREE.MeshPhongMaterial({ 
            color: BLOCK_TYPES[type].color 
        });
        BLOCK_TYPES[type].geometry = baseGeometry;
    }
}

// Get chunk key from position
function getChunkKey(x, z) {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    return `${chunkX},${chunkZ}`;
}

// Get chunk from position
function getChunk(x, z) {
    const key = getChunkKey(x, z);
    if (!chunks.has(key)) {
        chunks.set(key, []);
    }
    return chunks.get(key);
}

// Optimized block lookup
function getBlockAt(position) {
    const chunk = getChunk(position.x, position.z);
    return chunk.find(block => 
        Math.abs(block.position.x - position.x) < 0.1 &&
        Math.abs(block.position.y - position.y) < 0.1 &&
        Math.abs(block.position.z - position.z) < 0.1
    );
}

// Create a block with shared geometry
function createBlock(x, y, z, blockType = 'dirt') {
    const type = BLOCK_TYPES[blockType];
    const block = new THREE.Mesh(type.geometry, type.material);
    block.position.set(x, y, z);
    block.userData.blockType = blockType;
    
    // Add to spatial partition
    const chunk = getChunk(x, z);
    chunk.push(block);
    
    scene.add(block);
    state.blocks.push(block);
    return block;
}

// Function to break block
function breakBlock() {
    if (state.selectedBlock) {
        // Remove from scene
        scene.remove(state.selectedBlock);
        
        // Remove from blocks array
        const blockIndex = state.blocks.indexOf(state.selectedBlock);
        if (blockIndex > -1) {
            state.blocks.splice(blockIndex, 1);
        }
        
        // Remove from chunk
        const pos = state.selectedBlock.position;
        const chunk = getChunk(pos.x, pos.z);
        const chunkIndex = chunk.indexOf(state.selectedBlock);
        if (chunkIndex > -1) {
            chunk.splice(chunkIndex, 1);
        }
        
        state.selectedBlock = null;
        state.selectedBlockFace = null;
        selectionOutline.visible = false;
    }
}

// Function to place block
function placeBlock() {
    if (state.selectedBlock && state.selectedBlockFace) {
        const position = state.selectedBlock.position.clone();
        const normal = state.selectedBlockFace.clone();
        position.add(normal);
        
        if (!getBlockAt(position)) {
            const playerPos = camera.position.clone();
            const distance = position.distanceTo(playerPos);
            if (distance > 1.5) {
                createBlock(position.x, position.y, position.z, state.currentBlockType);
            }
        }
    }
}

// Hotbar selection
function initHotbar() {
    const hotbar = document.getElementById('hotbar');
    const slots = hotbar.querySelectorAll('.hotbar-slot');

    slots.forEach(slot => {
        slot.addEventListener('click', () => {
            slots.forEach(s => s.classList.remove('selected'));
            slot.classList.add('selected');
            state.currentBlockType = slot.dataset.block;
        });
    });

    document.addEventListener('keydown', (event) => {
        const num = parseInt(event.key);
        if (num >= 1 && num <= slots.length) {
            slots.forEach(s => s.classList.remove('selected'));
            slots[num - 1].classList.add('selected');
            state.currentBlockType = slots[num - 1].dataset.block;
        }
    });
}

// Event listeners
document.addEventListener('mousedown', function(event) {
    if (!gameState.isPlaying) return;
    
    if (!controls.isLocked) {
        controls.lock();
        return;
    }
    
    // Left click (button 0) to break blocks
    if (event.button === 0) {
        breakBlock();
    }
    // Right click (button 2) to place blocks
    else if (event.button === 2) {
        placeBlock();
    }
});

// Prevent context menu from showing up
document.addEventListener('contextmenu', function(event) {
    event.preventDefault();
});

// Fix the escape key handler by moving it to a global scope
// and making it work in both playing and paused states
document.addEventListener('keydown', function(event) {
    if (event.code === 'Escape') {
        // If we're playing and not paused, show the pause menu
        if (gameState.isPlaying && !gameState.isPaused) {
            pauseGame();
        }
        // If we're paused, resume the game
        else if (gameState.isPlaying && gameState.isPaused) {
            resumeGame();
        }
    }
});

// Update the onKeyDown function to avoid handling Escape key twice
function onKeyDown(event) {
    // Skip Escape key as it's handled globally
    if (event.code === 'Escape') return;
    
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            state.moveForward = true;
            break;
        case 'ArrowDown':
        case 'KeyS':
            state.moveBackward = true;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            state.moveLeft = true;
            break;
        case 'ArrowRight':
        case 'KeyD':
            state.moveRight = true;
            break;
        case 'Space':
            if (state.canJump && state.jumpCooldown <= 0) {
                state.velocity.y = JUMP_FORCE;
                state.canJump = false;
                state.jumpCooldown = JUMP_COOLDOWN;
            }
            break;
    }
}

// Update the pointer lock event listeners to handle escape menu better
controls.addEventListener('lock', function() {
    if (gameState.isPlaying) {
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
    }
});

controls.addEventListener('unlock', function() {
    // Only pause if we're playing, not paused, and not exiting to menu
    if (gameState.isPlaying && !gameState.isPaused && !gameState.exitingToMenu) {
        pauseGame();
    }
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
});

// Update the exitToMenu function to set the exitingToMenu flag
function exitToMenu() {
    gameState.exitingToMenu = true;
    escapeMenu.classList.add('menu-hidden');
    startMenu.classList.remove('menu-hidden');
    gameState.isPlaying = false;
    gameState.isPaused = false;
    controls.unlock();
    
    // Reset player position
    camera.position.set(TERRAIN_SIZE / 2, HEIGHT_SCALE + 2, TERRAIN_SIZE / 2);
    state.velocity.set(0, 0, 0);
    
    // Reset the flag after a short delay
    setTimeout(() => {
        gameState.exitingToMenu = false;
    }, 100);
}

// Movement controls
function onKeyUp(event) {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            state.moveForward = false;
            break;
        case 'ArrowDown':
        case 'KeyS':
            state.moveBackward = false;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            state.moveLeft = false;
            break;
        case 'ArrowRight':
        case 'KeyD':
            state.moveRight = false;
            break;
    }
}

// Optimized collision detection
function checkBlockCollision() {
    const playerPos = camera.position;
    const chunkKey = getChunkKey(playerPos.x, playerPos.z);
    let highestBlock = GROUND_LEVEL;

    // Check current chunk and adjacent chunks
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const checkX = Math.floor(playerPos.x / CHUNK_SIZE) + dx;
            const checkZ = Math.floor(playerPos.z / CHUNK_SIZE) + dz;
            const key = `${checkX},${checkZ}`;
            const chunk = chunks.get(key);
            
            if (!chunk) continue;

            for (const block of chunk) {
                if (Math.abs(block.position.x - playerPos.x) <= 0.5 && 
                    Math.abs(block.position.z - playerPos.z) <= 0.5) {
                    if (block.position.y + 1 > highestBlock && 
                        block.position.y + 1 <= playerPos.y) {
                        highestBlock = block.position.y + 1;
                    }
                }
            }
        }
    }

    return highestBlock;
}

// Optimized terrain generation
function generateTerrain() {
    const noise2D = createNoise2D();
    const caveNoise3D = (x, y, z) => {
        return noise2D(x / CAVE_SCALE, (y + z) / CAVE_SCALE);
    };

    // Pre-calculate heights for the entire terrain
    const heights = new Array(TERRAIN_SIZE);
    for (let x = 0; x < TERRAIN_SIZE; x++) {
        heights[x] = new Array(TERRAIN_SIZE);
        for (let z = 0; z < TERRAIN_SIZE; z++) {
            const nx = x / NOISE_SCALE;
            const nz = z / NOISE_SCALE;
            heights[x][z] = Math.floor(
                (noise2D(nx, nz) + 1) * 0.5 * HEIGHT_SCALE + HEIGHT_OFFSET
            );
        }
    }

    // Generate blocks using pre-calculated heights
    for (let x = 0; x < TERRAIN_SIZE; x++) {
        for (let z = 0; z < TERRAIN_SIZE; z++) {
            const height = heights[x][z];
            
            for (let y = 0; y < height; y++) {
                if (y > 1 && caveNoise3D(x, y, z) > CAVE_THRESHOLD) {
                    continue;
                }

                let blockType;
                if (y === 0) {
                    blockType = 'bedrock';
                } else if (y < height - 1) {
                    blockType = y / height > STONE_THRESHOLD ? 'stone' : 'dirt';
                } else {
                    blockType = 'grass';
                }

                createBlock(x, y, z, blockType);
            }
        }
    }
}

// Initialize block geometries before generating terrain
initBlockGeometries();

// Generate the terrain instead of the flat blocks
generateTerrain();

// Initialize hotbar
initHotbar();

// Add at the top of the file with other state variables
const gameState = {
    isPlaying: false,
    isPaused: false,
    exitingToMenu: false
};

// Add after the scene setup
// Menu elements
const startMenu = document.getElementById('start-menu');
const escapeMenu = document.getElementById('escape-menu');
const startGameButton = document.getElementById('start-game');
const resumeGameButton = document.getElementById('resume-game');
const exitToMenuButton = document.getElementById('exit-to-menu');

// Menu event listeners
startGameButton.addEventListener('click', startGame);
resumeGameButton.addEventListener('click', resumeGame);
exitToMenuButton.addEventListener('click', exitToMenu);

// Menu functions
function startGame() {
    startMenu.classList.add('menu-hidden');
    gameState.isPlaying = true;
    controls.lock();
}

function pauseGame() {
    if (gameState.isPlaying && !gameState.isPaused) {
        escapeMenu.classList.remove('menu-hidden');
        gameState.isPaused = true;
        controls.unlock();
    }
}

function resumeGame() {
    escapeMenu.classList.add('menu-hidden');
    gameState.isPaused = false;
    controls.lock();
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    // Only update game logic if playing and not paused
    if (gameState.isPlaying && !gameState.isPaused && controls.isLocked) {
        const time = performance.now();
        const delta = Math.min((time - state.prevTime) / 1000, 0.1);

        // Update physics at a lower frequency
        if (time - state.prevTime > 16) { // ~60 FPS
            // Update raycaster
            raycaster.ray.origin.copy(camera.position);
            raycaster.ray.direction.copy(controls.getDirection(new THREE.Vector3()));
            
            // Check for block intersection
            const currentChunk = getChunk(camera.position.x, camera.position.z);
            const intersects = raycaster.intersectObjects(currentChunk);
            
            if (intersects.length > 0 && intersects[0].distance <= maxReach) {
                state.selectedBlock = intersects[0].object;
                state.selectedBlockFace = intersects[0].face.normal;
                selectionOutline.position.copy(state.selectedBlock.position);
                selectionOutline.visible = true;
            } else {
                state.selectedBlock = null;
                state.selectedBlockFace = null;
                selectionOutline.visible = false;
            }

            // Get current surface height at player position
            const surfaceHeight = checkBlockCollision();
            const targetHeight = surfaceHeight + PLAYER_HEIGHT;
            
            // Update jump cooldown
            if (state.jumpCooldown > 0) {
                state.jumpCooldown -= delta;
            }

            // If we're falling or jumping (not walking up blocks)
            if (camera.position.y > targetHeight + 0.1 || state.velocity.y > 0) {
                // Apply gravity and check for ground collision
                state.velocity.y -= GRAVITY * delta;
                state.velocity.y = Math.max(state.velocity.y, -MAX_FALL_SPEED); // Limit fall speed
                
                camera.position.y += state.velocity.y * delta;
                
                // Check if we hit the ground
                if (camera.position.y < targetHeight) {
                    camera.position.y = targetHeight;
                    state.velocity.y = 0;
                    state.canJump = true;
                    state.jumpCooldown = 0;
                }
            } 
            // If we're walking up/down blocks
            else {
                const heightDiff = targetHeight - camera.position.y;
                if (Math.abs(heightDiff) > 0.01) {
                    camera.position.y += heightDiff * HEIGHT_TRANSITION_SPEED * delta;
                } else {
                    camera.position.y = targetHeight;
                    if (state.jumpCooldown <= 0) {
                        state.canJump = true;
                    }
                }
            }

            // Movement direction
            state.direction.z = Number(state.moveForward) - Number(state.moveBackward);
            state.direction.x = Number(state.moveRight) - Number(state.moveLeft);
            state.direction.normalize();

            // Update velocity based on input
            if (state.moveForward || state.moveBackward) {
                state.velocity.z = -state.direction.z * MOVE_SPEED;
            } else {
                state.velocity.z *= DAMPING;
            }

            if (state.moveLeft || state.moveRight) {
                state.velocity.x = -state.direction.x * MOVE_SPEED;
            } else {
                state.velocity.x *= DAMPING;
            }

            // Apply movement
            if (Math.abs(state.velocity.x) > 0.01) {
                controls.moveRight(-state.velocity.x * delta);
            }
            if (Math.abs(state.velocity.z) > 0.01) {
                controls.moveForward(-state.velocity.z * delta);
            }

            state.prevTime = time;
        }
    }

    renderer.render(scene, camera);
}

// Start animation loop
animate();

// Handle window resize
window.addEventListener('resize', onWindowResize, false);

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
} 