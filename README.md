# Binario Reboot - Rift Rail

Rinnovamento totale di **Binario - The Game**: il progetto abbandona la vecchia impostazione a commessa statica e adotta un’identità da **simulatore ferroviario realistico/arcade**, con run a checkpoint, HUD mobile compatto e ricompense immediate.

## Direzione consolidata

- **Grafica risolta in un unico tema**: `style.css` non contiene più override stratificati; il look principale è quello realistico richiesto, con sfondo fotografico, HUD scuro, pulsanti arancio effetto legno/metallo e joystick metallico.
- **Menu a run**: il feed è una selezione di distretti con crew personalizzabile e slot per espansioni.
- **Gameplay a checkpoint**: scan, hub, break ballast, recupero asset, drop, lock, stabilizzazione e upload QA sostituiscono la vecchia progressione a commessa.
- **HUD da simulatore mobile**: reputazione, crediti, timer, KPI e tasto HUD compatto in alto a sinistra restano visibili senza appesantire lo schermo.
- **Controlli touch corretti**: il suggerimento contestuale non intercetta più i tap e il pulsante ENTRA/AZIONE resta utilizzabile su mobile.

## Ciclo di gioco attuale

1. Avvia la run dal menu Rift Rail.
2. Scansiona il beacon iniziale.
3. Attiva l’hub operativo.
4. Usa la classe Breaker per demolire e caricare ballast.
5. Usa la classe Logistica per recuperare l’asset vecchio e droppare il nuovo modulo.
6. Chiudi i lock manuali sulla linea.
7. Usa la classe Stabilizer per consolidare il tracciato.
8. Completa l’upload QA e conquista la zona.

## Avvio locale

Apri `index.html` in un browser moderno oppure servi la cartella con un server statico:

```bash
python3 -m http.server 8000
```

Poi visita `http://localhost:8000`.
