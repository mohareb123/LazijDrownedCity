# Imported models and rig verification

- Mechanical spider: prototypesDeprakash, https://github.com/prototypesDeprakash/Mechanica-Spider-ik-rigged-blender-file- . Author README permits use for any purpose. Original Blender file converted to GLB; rigid bone-parented parts converted to vertex weights; bevel/subdivision modifiers removed for performance. Six-legged mechanical design, 54 bones, six rigs. Not an anatomically eight-legged spider. Existing symbiote material applied in game. Animation advances with movement, without leg regrowth.
- RobotExpressive: Tomás Laulhé (Quaternius), CC0 1.0; modifications and glTF conversion by Don McCurdy. Source: three.js r169 examples/models/gltf/RobotExpressive. 43 bones, skeletal animations.
- Fox: PixelMannen (model, CC0); tomkranis (rigging/animation, CC BY 4.0); AsoboStudio and scurest (glTF conversion, CC BY 4.0). https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox . 24 bones. Scaled/tinted in game as boss.
- Littlest Tokyo: Glen Fox, CC Attribution; https://sketchfab.com/3d-models/littlest-tokyo-94b24a60dc1b48248de50bf087c0f042 . Obtained from three.js r169 examples/models/gltf/LittlestTokyo.glb. Draco decompressed for offline use. Static decorative district on outskirts; not a replacement for the procedural collision world. GLB inspection found 32 joints and 8 skinned nodes for animated scene elements; the buildings themselves do not require skeletal animation. City animation is not currently played in game.

CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
CC0: https://creativecommons.org/publicdomain/zero/1.0/
Three.js and example loader code: MIT, https://github.com/mrdoob/three.js/blob/r169/LICENSE
