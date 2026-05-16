# Binario The Game - Cantiere Mobile

Il progetto è stato riscritto come mockup giocabile in stile simulatore mobile: una schermata verticale con sfondo di cantiere ferroviario, pulsante **HUD**, joystick metallico, messaggio centrale e controlli gialli come nella reference.

## Cosa include

- **Scena full-screen verticale** con immagine del cantiere e vignettatura cinematografica.
- **HUD compatto** apribile dal pulsante in alto a sinistra.
- **Joystick metallico** con frecce direzionali e feedback visivo.
- **Pulsanti SCAVA, BOOST, CAM e MENU** con finitura gialla/oro.
- **Loop semplice senza conflitti di ID**: entra nell'escavatore, scava, usa il boost, cambia camera e resetta dal menu.

## Comandi

| Azione | Touch / Mouse | Tastiera |
| --- | --- | --- |
| Entra o scendi dall'escavatore | ENTRA / SCAVA quando sei a piedi | `E` o `Invio` |
| Scava | SCAVA | `Spazio` o `X` |
| Boost | BOOST | `B` |
| Cambia camera | CAM | `C` |
| Menu | MENU | `Esc` |

## Avvio locale

Apri `index.html` in un browser moderno oppure servi la cartella con un server statico:

```bash
python3 -m http.server 8000
```

Poi visita `http://localhost:8000`.
