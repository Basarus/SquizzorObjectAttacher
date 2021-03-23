﻿import natives from 'natives';
import alt from 'alt';
import registeredObjects from 'client/objects';

const DEBUG_MODE = true;
const OBJECT_RANGE = 30;
const CHECK_INTERVAL = 1000;
const CURSOR_TOGGLE_KEY = 122; // F11

var currentExistingObjects = [];
var cursorActive = false;

function outputMessage(message) {
    console.log('[ObjectAttacher] ' + message);
}

function toggleCursor() {
    try {
        alt.showCursor(!cursorActive);
        alt.toggleGameControls(cursorActive);
        cursorActive = !cursorActive;
    } catch(e) {
        outputMessage(e.message);
    }
}

function removeObjectFromPlayer(player) {
    try {
        var object = currentExistingObjects[player.id];
        if (object && natives.doesEntityExist(object)) {
            natives.detachEntity(object, true, true);
            natives.deleteObject(object);
            currentExistingObjects[player.id] = null;
            // Show weapon again
            natives.setPedCurrentWeaponVisible(player.scriptID, true, true, true, true);
        }
    } catch(e) {
        outputMessage(e.message);
    }
}

function attachObjectToPlayer(player, boneId, objectName, positionX, positionY, positionZ, rotationX, rotationY, rotationZ) {
    try {
        // Remove existing object (if exists)
        removeObjectFromPlayer(player);

        var hashOfProp = natives.getHashKey(objectName);

        natives.requestModel(hashOfProp);
        const modelLoadInterval = alt.setInterval(() => {
            if (natives.hasModelLoaded(hashOfProp)) {
                alt.clearInterval(modelLoadInterval)
            } 
        }, 100);

        var newObject = natives.createObject(hashOfProp, player.pos.x, player.pos.y, player.pos.z, true, true, true);

        // Release memory for model
        natives.setModelAsNoLongerNeeded(hashOfProp);
        
        var boneIndex = natives.getPedBoneIndex(player.scriptID, boneId); 

        if (newObject) {
            // Hide weapon before attaching object
            natives.setPedCurrentWeaponVisible(player.scriptID, false, true, true, true);

            natives.attachEntityToEntity(newObject, player.scriptID, boneIndex, positionX, positionY, positionZ, rotationX, rotationY, rotationZ, 
                false, false, false, false, 1, true);  

            currentExistingObjects[player.id] = newObject;
        } else {
            outputMessage('Object is null: ' + objectName);
        }
    } catch(e) {
        outputMessage(e.message);
    }
}

function attachRegisteredObjectToPlayer(player, objectName) {
    if (registeredObjects[objectName]) {
        var objectData = registeredObjects[objectName];
        attachObjectToPlayer(player, objectData.boneId, objectData.objectName, objectData.position.x, objectData.position.y, objectData.position.z, 
            objectData.rotation.x, objectData.rotation.y, objectData.rotation.z);
    } else {
        outputMessage('Object is not registered: ' + objectName);
    }
}

function playAnimationOnLocalPlayer(animDictionary, animationName, animationFlag) {
    try {
        if (natives.doesAnimDictExist(animDictionary)) {
            natives.requestAnimDict(animDictionary);

            const animDictLoadInterval = alt.setInterval(() => {
                if (natives.hasAnimDictLoaded(animDictionary)) {
                    alt.clearInterval(animDictLoadInterval)
                } 
            }, 100)

            natives.taskPlayAnim(alt.Player.local.scriptID, animDictionary, animationName, 8.0, 8.0, -1, animationFlag, 1.0, false, false, false);
        } else {
            outputMessage('Animation dictionary does not exist');
        }
    } catch(e) {
        outputMessage(e.message);
    }
}

function resetAnimationOnLocalPlayer() {
    try {
        natives.clearPedTasks(alt.Player.local.scriptID);
    } catch(e) {
        outputMessage(e.message);
    }
}

// Interval for attaching and removing objects from remote players
alt.setInterval(() => {
    try {
        alt.Player.all.forEach(remotePlayer => {
            // Skip local player
            if (remotePlayer.id == alt.Player.local.id) {
                return;
            }
                
            var objectOfRemotePlayer = remotePlayer.getSyncedMeta('AttachedObject');
    
            if (objectOfRemotePlayer) {
                var isRemotePlayerInRange = remotePlayer.scriptID && remotePlayer.pos.isInRange(alt.Player.local.pos, OBJECT_RANGE);
    
                // Object not created yet?
                if (!currentExistingObjects[remotePlayer.id]) {
                    if (isRemotePlayerInRange) {
                        // Attach object to remote player
                        attachRegisteredObjectToPlayer(remotePlayer, objectOfRemotePlayer);
                    }
                } else {
                    // Players is holding object, but is not in range anymore
                    if(!isRemotePlayerInRange) {
                        removeObjectFromPlayer(remotePlayer);
                    }
                }
            } else {
                // Remove object, if player was holding one before
                removeObjectFromPlayer(remotePlayer);
            }
        });
    } catch(e) {
        outputMessage(e.message);
    }
}, CHECK_INTERVAL);

alt.on('objectAttacher:attachObject', (objectName) => {
    attachRegisteredObjectToPlayer(alt.Player.local, objectName);
    alt.emitServer('objectAttacher:attachedObject', objectName);
});

alt.on('objectAttacher:detachObject', () => {
    removeObjectFromPlayer(alt.Player.local);
    alt.emitServer('objectAttacher:detachedObject');
});

if (DEBUG_MODE) {
    var mainView = new alt.WebView('/resource/client/html/index.html');

    alt.setInterval(() => {
        natives.invalidateIdleCam();
    }, 2000);

    mainView.on('objectAttacher:debug:requestRegisteredObjects', () => {
        mainView.emit('objectAttacher:debug:setRegisteredObjects', registeredObjects);
    });

    mainView.on('objectAttacher:debug:attachObject', (objectName, boneId, positionX, positionY, positionZ, rotationX, rotationY, rotationZ) => {
        attachObjectToPlayer(alt.Player.local, boneId, objectName, positionX, positionY, positionZ, rotationX, rotationY, rotationZ);
    });

    mainView.on('objectAttacher:debug:detachObject', () => {
        removeObjectFromPlayer(alt.Player.local);
    });

    mainView.on('objectAttacher:debug:changeAnimation', (animationDict, animationName, animationFlag) => {
        playAnimationOnLocalPlayer(animationDict, animationName, animationFlag);
    });

    mainView.on('objectAttacher:debug:resetAnimation', () => {
        resetAnimationOnLocalPlayer();
    });

    alt.on('consoleCommand', (command, ...args) => {
        if (command === 'objectattacher') {
            mainView.isVisible = !mainView.isVisible;
        }
    });

    alt.on("keyup", function (key) {
        if (key == CURSOR_TOGGLE_KEY) { 
            toggleCursor();
        }
    });
}