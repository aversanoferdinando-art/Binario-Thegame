# BINARIO TO GAME

Simulatore professionale web di armamento ferroviario italiano. La Fase 1 sostituisce il vecchio mockup mobile con una base modulare giocabile: cantiere ferroviario esteso, tre binari principali, scambi, stazione, piazzale operativo, mezzi pesanti e sequenza lavori tecnica.

## Fase 1

- Mappa ferroviaria procedurale con stazione, officina, magazzino, piazzale materiali, illuminazione e vegetazione.
- Tre binari paralleli con ballast, traverse, rotaie, scambi, usura, erbacce, guasti e geometria dinamica.
- Mezzi giocabili: escavatore gomma/rotaia, Vaiacar e rincalzatrice.
- Fisica pesante con massa, inerzia, freno, ruote ferroviarie, aderenza, vibrazioni e idraulica.
- Ciclo giorno/notte, meteo, treni AI, operai AI, radio cantiere e HUD tecnico.
- Sequenza lavori: isolamento, scavo, rimozione ballast, traverse, rotaie, rincalzatura, correzione geometria e collaudo.

## Architettura

```text
/audio
/construction
/core
/economy
/jobs
/multiplayer
/physics
/rail_system
/tools
/ui
/vehicles
/world
```

## Comandi

| Azione | Tastiera | UI |
| --- | --- | --- |
| Seleziona escavatore / Vaiacar / rincalzatrice | `1`, `2`, `3` | pulsanti flotta |
| Sali o scendi | `E` | SALI / SCENDI |
| Motore | `M` | MOTORE |
| Ruote ferroviarie | `R` | RUOTE FERRO |
| Movimento | `WASD` / frecce | joystick |
| Lavorazione | `Spazio` | LAVORA tenuto premuto |
| Camera | `C` | CAM |

## Avvio locale

Serve un server statico per i moduli JavaScript:

```bash
python3 -m http.server 8000
```

Poi visita `http://localhost:8000`.

## Verifica

```bash
node tools/smoke-test.js
```
