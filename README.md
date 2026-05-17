# Binario The Game - Cantiere Mobile

Il progetto è stato riscritto come mockup giocabile in stile simulatore mobile: una schermata verticale con cantiere ferroviario generato in CSS, pulsante **HUD**, joystick metallico, messaggio centrale e controlli gialli come nella reference.

## Cosa include

- **Menu principale pulito** con pulsante `ENTRA NEL GIOCO`, pausa, riprendi e reset missione.
- **Scena full-screen verticale** con deposito, alberi, binari, mezzi e operai disegnati in CSS per evitare immagini sbagliate o ritagli del logo.
- **HUD compatto** apribile dal pulsante in alto a sinistra solo dopo l'ingresso in gioco.
- **Joystick metallico** con frecce direzionali e feedback visivo.
- **Pulsanti SCAVA, BOOST, CAM e MENU** con finitura gialla/oro.
- **Loop semplice senza conflitti di ID**: entra nell'escavatore, scava, usa il boost, cambia camera, apri il menu e riprendi la partita.

## Comandi

| Azione | Touch / Mouse | Tastiera |
| --- | --- | --- |
| Entra nel gioco dal menu | `ENTRA NEL GIOCO` | `Invio` o `Spazio` |
| Entra o scendi dall'escavatore | ENTRA / SCAVA quando sei a piedi | `E` o `Invio` |
| Scava | SCAVA | `Spazio` o `X` |
| Boost | BOOST | `B` |
| Cambia camera | CAM | `C` |
| Menu / Pausa | MENU | `Esc` |

## Avvio locale

Apri `index.html` in un browser moderno oppure servi la cartella con un server statico:

```bash
python3 -m http.server 8000
```

Poi visita `http://localhost:8000`.
