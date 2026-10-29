# 0.9.2 新增原创素材

生成工具：内置 image_gen。均已保存到项目素材包，未引用临时目录。

## 关都手绘地图

最终文件：`public/assets/maps/kanto-region-painted-v1.png`。原生 SVG 作为定位与加载回退图保留。底图是改编绘制，地点与移动规则仍由 map.json 决定。

最终提示词：

```
Use case: illustration-story
Asset type: illustrated regional map background for a Pokémon Kanto fan RPG, square 1:1
Input image: the supplied map is a GEOMETRY / POSITION reference only. Keep its mainland and small southern islands, forests, mountain belts, road network and landmark positions tightly aligned. Remove every word, every text label, every dot/circle marker, every UI border. Code will overlay real interactive markers later.
Primary request: replace the simple flat vector map with a beautiful richly painted top-down adventure atlas illustration, evoking a lovingly illustrated anime fantasy Kanto region map. Real hand-painted depth, lovely rivers, textured forest canopies, rocky northern ridges, cliffs, tiny town roof clusters at the former node positions, farmland, volcanic southern island, cave mouths, calm coastal waters, soft surf and beaches. Orthographic top down, not an isometric poster. Keep terrain readable underneath small UI markers.
Composition invariants, in percentages of width/height: plateau 30/22, western mountain city 31/34, mountain cave 50/35, northeastern water city 67/34, forest 30/48, central cities 42/53 and 56/54, eastern town 78/58, western city 30/74, harbor 53/73, southern city 55/91, starting village 30/88, islands 16/91 and 22/96, eastern safari peninsula at60/96. Do not move or invent a giant new continent. Blue-green ocean must occupy outside coast and bottom; terrain detail must be small enough for the code labels. A fine network of paths can connect former marker positions.
Style/medium: high quality anime game atlas painting, natural sage/forest greens, warm ochre roads, teal water, softly lit mossy peaks, subtle paper texture, refined miniature details, clean bright readable shape language, not pixel art, not a grainy screenshot. No characters, no Pokémon, no text, no lettering, no compass, no title, no labels, no markers, no legend, no frame, no watermark. Opaque background.
```

## 捕虫少年

最终文件：`public/assets/trainers/project-original/bug-catcher-v1.png`。原始生成后再清理背景；最终RGBA文件，背景取样alpha为0，保留完整网与双脚。

生成提示词：

```
Use case: illustration-story
Asset type: transparent full-body character portrait for a Pokémon Kanto fan RPG stage
Primary request: a polished anime Bug Catcher boy trainer, unmistakably the classic Kanto bug-catching child class, not a generic teen. He is an ordinary fully clothed 10–12 year old boy with short dark-brown hair, a natural woven straw sunhat, a modest pale-cream short-sleeved camp shirt, olive knee-length shorts, little sturdy hiking shoes and socks. He carries a long butterfly net in one hand with the net hoop fully visible, a small insect collecting shoulder case at his side. Warm determined friendly expression, relaxed standing pose, age-appropriate small child proportions.
Style: clean high-quality Pokémon-anime-inspired cel shading, refined expressive eyes, crisp confident linework, detailed fabric and woven hat, smooth high-resolution illustration, absolutely not pixel art, no blurry upscaling, no chibi. Coherent with polished anime full-body visual novel cast art.
Composition: single complete head-to-toe figure and complete net, facing viewer at slight three-quarter angle. Entire hat, both shoes, net tip and hoop inside image; modest transparent margins. Tall portrait, centered body, readable silhouette. Soft even studio character lighting.
Background: actual transparent alpha cutout. No backdrop, no scene, no floor, no card border, no screenshot frame, no text, no logos, no watermark, no Pokémon or other characters. Do not crop any part of the boy or the net.
```

透明背景修订提示词：

```
Use case: background-extraction
Edit target: this exact Bug Catcher boy portrait. Keep the boy, complete hat, butterfly net, collecting box, clothes, face, pose, colors and all shoes unchanged.
Change only the background and cutout quality: REMOVE the entire dark green/brown/black gradient haze, vignette, glow, shadow plate and all semi-transparent fog around him. The background outside the exact boy/net/hat/box silhouette must be 100% empty alpha=0. The boy and net object pixels should be opaque with only a thin antialiased contour. The net's mesh itself can retain its delicate holes, but no background haze behind it. Deliver a clean production sprite cutout on a truly transparent background, not an illustrated checkerboard. No floor, no backdrop, no extra shadows, no text.
```

