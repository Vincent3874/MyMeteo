// Normales mensuelles 1981-2010, extraites des fichiers MD du dossier :
// - Saint-Martin-d'Hères : "Normales et records climatologiques 1981-2010 à Saint-Martin-d'Hères - Infoclimat.md"
// - Grenoble-St Geoirs (indicatif 07486, données officielles Météo-France) :
//   "Station météorologique de Grenoble-St Geoirs Indicatif _ 07486.md"
// Tableaux : lignes "Tempé. maxi moyennes", "Tempé. moy moyennes", "Tempé. mini moyennes", "Cumul moyen Précips".
// Les valeurs sont embarquées ici en JS car un fetch() de fichier local est bloqué en file://.
var NORMALES = {
  smh: {
    nom: "Saint-Martin-d'Hères",
    source: "Infoclimat — normales 1981-2010",
    tempMax: [6.3, 9.3, 13.7, 19.6, 23.2, 27.5, 30.5, 27.7, 24.2, 19.2, 11.7, 6.3],
    tempMoy: [2.7, 4.5, 8.3, 13.5, 17.3, 21.2, 23.7, 21.7, 18.6, 14.4, 7.7, 3.0],
    tempMin: [-1.0, -0.2, 2.9, 7.4, 11.4, 14.8, 16.9, 15.7, 13.0, 9.6, 3.8, -0.3],
    rainMoy: [64.6, 46.4, 60.7, 54.6, 84.4, 71.8, 60.4, 90.2, 59.0, 75.2, 66.2, 65.5]
  },
  gre: {
    nom: "Grenoble-St Geoirs (07486)",
    source: "Météo-France — normales 1981-2010 (données officielles)",
    tempMax: [5.9, 7.8, 12.0, 15.3, 19.9, 23.8, 26.9, 26.4, 21.8, 16.9, 10.2, 6.4],
    tempMoy: [2.4, 3.7, 7.0, 9.8, 14.4, 17.9, 20.5, 20.2, 16.3, 12.3, 6.5, 3.2],
    tempMin: [-1.2, -0.4, 2.0, 4.4, 8.9, 12.0, 14.2, 14.0, 10.9, 7.8, 2.7, -0.1],
    rainMoy: [61.3, 51.6, 66.3, 83.0, 104.1, 75.2, 59.3, 67.2, 105.7, 105.8, 87.7, 67.1]
  }
};
