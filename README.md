# Binario The Game - Cantiere Mobile

Mockup giocabile in stile simulatore mobile per un cantiere ferroviario. La schermata verticale usa lo sfondo del cantiere, HUD apribile, mini-mappa, joystick metallico e pulsanti gialli in stile macchina operatrice.

## Stato della riscrittura

- Nessun marker di conflitto Git residuo nei file sorgente.
- ID HTML e selettori JavaScript allineati in un unico flusso di gioco.
- UI mobile riorganizzata con topbar, HUD missione, mini-mappa, area di lavoro e banner di completamento.
- Loop completo: raggiungi l'escavatore, sali a bordo, scava, livella, ispeziona e consegna il binario.

## Comandi

| Azione | Touch / Mouse | Tastiera |
| --- | --- | --- |
| Muovi operatore o escavatore | Joystick | Frecce o `WASD` |
| Entra o scendi dall'escavatore | ENTRA / LAVORA quando sei a piedi | `E` o `Invio` |
| Lavora sul binario | LAVORA | `Spazio` o `X` |
| Boost temporaneo | BOOST | `B` |
| Cambia camera | CAM | `C` |
| Menu | MENU | `Esc` |

## Avvio locale

Apri `index.html` in un browser moderno oppure servi la cartella con un server statico:

```bash
python3 -m http.server 8000
```

Poi visita `http://localhost:8000`.
