import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';

// Block types
const BLOCK_TYPES = {
    dirt: { color: 0x8b4513 },
    stone: { color: 0x808080 },
    grass: { color: 0x567d46 }
};

// Game state
const state = {
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    canJump: true,
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
const JUMP_FORCE = 12;
const MOVE_SPEED = 6;
const DAMPING = 0.9; // Friction
const PLAYER_HEIGHT = 1.6; // Typical Minecraft player height
const GROUND_LEVEL = 0; // Ground level position
const HEIGHT_TRANSITION_SPEED = 10; // Speed of height adjustment

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky blue

// Camera setup
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, PLAYER_HEIGHT, 0);

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

// Create ground
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterial = new THREE.MeshPhongMaterial({ 
    color: 0x567d46,
    side: THREE.DoubleSide 
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2; // Rotate to be flat
ground.position.y = GROUND_LEVEL;
scene.add(ground);

// Helper function to get block at position
function getBlockAt(position) {
    return state.blocks.find(block => 
        Math.abs(block.position.x - position.x) < 0.1 &&
        Math.abs(block.position.y - position.y) < 0.1 &&
        Math.abs(block.position.z - position.z) < 0.1
    );
}

// Create a simple cube (block)
function createBlock(x, y, z, blockType = 'dirt') {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshPhongMaterial({ 
        color: BLOCK_TYPES[blockType].color
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(x, y, z);
    cube.userData.blockType = blockType;
    scene.add(cube);
    state.blocks.push(cube);
    return cube;
}

// Function to break block
function breakBlock() {
    if (state.selectedBlock) {
        const index = state.blocks.indexOf(state.selectedBlock);
        if (index > -1) {
            scene.remove(state.selectedBlock);
            state.blocks.splice(index, 1);
        }
        state.selectedBlock = null;
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

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

// Movement controls
function onKeyDown(event) {
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
            if (state.canJump) {
                state.velocity.y = JUMP_FORCE;
                state.canJump = false;
            }
            break;
    }
}

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

// Collision detection helper
function checkBlockCollision() {
    const playerPosition = camera.position.clone();
    let highestBlock = GROUND_LEVEL;

    for (const block of state.blocks) {
        if (playerPosition.x >= block.position.x - 0.5 && 
            playerPosition.x <= block.position.x + 0.5 &&
            playerPosition.z >= block.position.z - 0.5 && 
            playerPosition.z <= block.position.z + 0.5) {
            if (block.position.y + 1 > highestBlock && 
                block.position.y + 1 <= playerPosition.y) {
                highestBlock = block.position.y + 1;
            }
        }
    }

    return highestBlock;
}

// Create initial blocks
for (let i = -5; i < 5; i++) {
    for (let j = -5; j < 5; j++) {
        const blockType = Math.random() < 0.3 ? 'stone' : 'dirt';
        createBlock(i, 0.5, j, blockType);
    }
}

// Initialize hotbar
initHotbar();

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    if (controls.isLocked) {
        const time = performance.now();
        const delta = Math.min((time - state.prevTime) / 1000, 0.1);

        // Update raycaster
        raycaster.ray.origin.copy(camera.position);
        raycaster.ray.direction.copy(controls.getDirection(new THREE.Vector3()));
        
        // Check for block intersection
        const intersects = raycaster.intersectObjects(state.blocks);
        
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

        // Apply gravity if we're above the target height
        if (camera.position.y > state.targetHeight) {
            state.velocity.y -= GRAVITY * delta;
        }

        // Get current surface height at player position
        const surfaceHeight = checkBlockCollision();
        const minHeight = Math.max(PLAYER_HEIGHT + surfaceHeight, PLAYER_HEIGHT);
        state.targetHeight = minHeight;

        // Smooth height transition
        if (!state.canJump) {
            camera.position.y += state.velocity.y * delta;
            if (camera.position.y < state.targetHeight) {
                camera.position.y = state.targetHeight;
                state.velocity.y = 0;
                state.canJump = true;
            }
        } else {
            const heightDiff = state.targetHeight - camera.position.y;
            if (Math.abs(heightDiff) > 0.01) {
                camera.position.y += heightDiff * HEIGHT_TRANSITION_SPEED * delta;
            } else {
                camera.position.y = state.targetHeight;
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