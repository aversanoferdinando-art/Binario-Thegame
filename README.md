# Binario - The Game

Simulatore 3D browser/mobile di un cantiere ferroviario costruito con Three.js r128.

## Novità principali

- Personaggio umano personalizzabile da menu: nome, colore tuta, casco e tono pelle.
- Gameplay ispirato ai simulatori di escavatore: cingoli, torretta, braccio, avambraccio e benna con controlli idraulici separati.
- Missione **Scavo ballast**: sali sull’escavatore, riempi la benna dal cumulo e carica 5 scarichi nel camion prima delle lavorazioni ferroviarie.
- Power-up **Turbo Focus**: un nucleo azzurro da raccogliere nel cantiere, attivabile con `F` o `BOOST`.
- HUD con stato power-up, cooldown, progresso scavo e feedback testuale in tempo reale.
- Missione guidata: ispezione, preparazione cantiere, scavo, rimozione rotaia, posa, fissaggio, rincalzatura e controllo finale.

## Controlli principali

- A piedi: `WASD`/joystick per muoversi, `E`/`ENTRA` per interagire.
- Escavatore: `WASD` cingoli, `Q/E` rotazione torretta, `R/F` braccio, `T/G` avambraccio, `Z/X` benna, `Space`/`AZIONE` per scavare o scaricare.
- Caricatore strada-rotaia: `WASD` guida, `Space`/`AZIONE` per rimuovere o posare rotaia.
- Rincalzatrice: joystick su/giù o `W/S` per avanzare, `Space`/`AZIONE` per rincalzare.
- Power-up: raccogli il nucleo azzurro e premi `F` o `BOOST`.

## App Store

Il progetto attuale è una web app statica. Per pubblicarlo su App Store serve convertirlo in un’app iOS con un wrapper nativo, per esempio Capacitor o Cordova, preparare icone/splash, firmare con Apple Developer Program, testare su dispositivi reali e inviarlo tramite App Store Connect.

## Avvio locale

Apri `index.html` in un browser moderno oppure servi la cartella con un server statico, ad esempio:

```bash
python3 -m http.server 8000
```

Poi visita `http://localhost:8000`.
