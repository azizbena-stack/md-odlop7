// Guide de survie embarqué. Sert aussi de base de connaissances à l'IA hors ligne.
export const CATS = {
  urgence: 'Urgence', nuit: 'Abri & nuit', eau: 'Eau', feu: 'Feu', manger: 'Se nourrir',
  soins: 'Premiers secours', montagne: 'Montagne', orient: 'Orientation', signal: 'Se faire trouver',
  animaux: 'Animaux', potager: 'Potager', voyage: 'Voyage', mer: 'Mer', meteo: 'Météo',
};

export const FICHES = [
{ id: 'perdu', cat: 'urgence', titre: 'Je suis perdu', mots: 'perdu égaré panique désorienté stop rester',
  corps: `<ol>
<li><b>Arrête-toi.</b> Ne marche plus au hasard. Assieds-toi, bois une gorgée, respire lentement dix fois.</li>
<li><b>Réfléchis.</b> D'où viens-tu ? Quel est le dernier endroit que tu connais avec certitude ?</li>
<li><b>Observe.</b> Heure de la nuit, météo, eau, nourriture, batterie, blessures, matériel.</li>
<li><b>Décide.</b> Si quelqu'un sait où tu es : <b>reste sur place</b>, les secours cherchent d'abord le long de ton itinéraire. Sinon, reviens vers le dernier point connu, ou vers le lieu habité indiqué par T’es où ?</li>
</ol>
<p class="note">La plupart des personnes perdues sont retrouvées en moins de 24 h, surtout celles qui restent visibles et immobiles.</p>
<p>Si tu bouges : marque ton passage (cairns, branches cassées, flèches au sol), et enregistre ta position de départ dans <b>Boussole › Retour</b>.</p>` },

{ id: 'priorites', cat: 'urgence', titre: 'Les priorités : règle des 3', mots: 'priorité règle trois ordre abri eau nourriture',
  corps: `<p>On tient environ <b>3 minutes</b> sans air, <b>3 heures</b> sans abri par mauvais temps, <b>3 jours</b> sans eau, <b>3 semaines</b> sans nourriture.</p>
<ol><li><b>Danger immédiat</b> : blessure grave, chute, eau, feu.</li><li><b>Garder sa chaleur</b> : le froid et l'humidité tuent en quelques heures.</li><li><b>Signaler sa présence.</b></li><li><b>L'eau.</b></li><li><b>La nourriture</b>, en dernier.</li></ol>
<p class="note">La faim fait peur mais tue rarement. Le froid tue souvent.</p>` },

{ id: 'batterie', cat: 'urgence', titre: 'Économiser la batterie', mots: 'batterie téléphone charge économie froid',
  corps: `<ul><li>Mode avion (le GPS marche quand même), luminosité au minimum.</li>
<li>Garde le téléphone <b>contre ton corps</b> : le froid vide la batterie.</li>
<li>Allume-le pour une tâche précise, puis éteins l'écran.</li>
<li>Note tes coordonnées sur papier ou sur ta main.</li>
<li>Garde 20 % minimum pour un appel au 112.</li></ul>` },

{ id: 'appel', cat: 'urgence', titre: 'Appeler les secours', mots: 'appel 112 15 18 17 secours numéro téléphone réseau sms 114',
  corps: `<ul><li><b>112</b> : urgence européenne. Passe par n'importe quel opérateur à portée, même sans ton réseau.</li>
<li><b>15</b> SAMU · <b>18</b> pompiers · <b>17</b> police · <b>196</b> secours en mer · <b>114</b> par SMS si tu ne peux pas parler.</li></ul>
<p><b>Dis dans l'ordre :</b> qui tu es, où tu es (coordonnées affichées dans SOS), ce qui s'est passé, combien de personnes, état des blessés. <b>Ne raccroche pas</b> le premier.</p>
<p>Pas de réseau ? Monte sur un point haut et dégagé, loin des fonds de vallée.</p>` },

{ id: 'abri', cat: 'nuit', titre: 'Construire un abri', mots: 'abri nuit froid dormir construire couverture survie isoler sol',
  corps: `<ol><li><b>Isole-toi du sol</b> d'abord : 20 cm de branchages, fougères, feuilles sèches, sac. Le sol vole plus de chaleur que l'air.</li>
<li><b>Coupe le vent</b> : rocher, tronc couché, talus.</li>
<li><b>Fais petit</b> : juste ta taille, ton corps doit réchauffer l'air.</li>
<li><b>Appentis</b> : une branche horizontale entre deux arbres, des branches inclinées côté vent, couvertes de feuillage épais.</li>
<li><b>Couverture de survie</b> : face argentée vers toi pour garder la chaleur, enroulée autour du corps, sous un vêtement si possible.</li></ol>
<p class="note">Commence ton abri au moins 1 h 30 avant la nuit.</p>` },

{ id: 'bivouac', cat: 'nuit', titre: 'Où ne pas dormir', mots: 'dormir dangereux endroit bivouac emplacement crue avalanche foudre arbre',
  corps: `<ul><li><b>Lit de rivière, fond de ravin, ruisseau à sec</b> : une crue peut monter en minutes.</li>
<li><b>Sous des arbres morts ou des grosses branches mortes</b> : elles tombent avec le vent.</li>
<li><b>Pied de falaise, éboulis</b> : chutes de pierres.</li>
<li><b>Crête et sommet</b> : vent, froid, foudre.</li>
<li><b>Pente enneigée</b> ou bas d'un couloir : avalanche.</li>
<li><b>Creux</b> : l'air froid et l'eau s'y accumulent.</li>
<li>Près des fourmilières, nids de guêpes, terriers, traces fraîches de sangliers.</li></ul>
<p>Le bon endroit : légèrement surélevé, plat, abrité du vent, avec de quoi isoler le sol.</p>` },

{ id: 'eau-trouver', cat: 'eau', titre: 'Trouver de l\'eau', mots: 'eau soif trouver source boire rosée pluie neige',
  corps: `<ul><li>Les <b>points d'eau</b> les plus proches sont dans l'onglet Situation.</li>
<li>Descends vers les fonds de vallon, cherche la végétation verte et dense, écoute.</li>
<li><b>Pluie</b> : couverture de survie ou sac plastique tendu.</li>
<li><b>Rosée</b> : un tissu passé sur l'herbe à l'aube, puis essoré.</li>
<li><b>Neige</b> : fais-la fondre, ne la mange pas, elle refroidit le corps.</li></ul>
<p class="note">Besoin : 2 à 3 L par jour, plus 0,5 à 1 L par heure d'effort au chaud. Sans eau, mange peu : digérer en consomme.</p>` },

{ id: 'eau-purifier', cat: 'eau', titre: 'Rendre l\'eau potable', mots: 'eau potable purifier bouillir pastille filtre sodis',
  corps: `<ol><li><b>Filtre</b> l'eau trouble dans un tissu pour enlever les débris.</li>
<li><b>Bouillir</b> : 1 minute à gros bouillons, 3 minutes au-dessus de 2 000 m.</li>
<li><b>Pastilles</b> : suis la notice (souvent 30 min d'attente, plus si l'eau est froide).</li>
<li><b>Soleil (SODIS)</b> : bouteille plastique transparente pleine d'eau claire, couchée au soleil 6 h (2 jours si nuageux).</li></ol>
<p class="note">Si tu n'as aucun moyen et que la soif devient dangereuse, bois l'eau la plus claire et courante possible : la déshydratation tue plus vite.</p>` },

{ id: 'feu', cat: 'feu', titre: 'Faire du feu', mots: 'feu allumer chaleur briquet bois brindille',
  corps: `<ol><li>Endroit abrité du vent, sol dégagé (terre, pierre), loin des branches basses.</li>
<li><b>Prépare tout avant</b> : amadou (herbe sèche, écorce de bouleau, coton), brindilles fines comme des allumettes, puis du bois de la taille d'un pouce, puis plus gros.</li>
<li>Petit tipi de brindilles au-dessus de l'amadou, allume par en dessous côté vent.</li>
<li>Souffle doucement à la base, ajoute le bois progressivement.</li></ol>
<p class="note">Le bois mort qui casse net avec un « crac » est sec. Le bois au sol est souvent humide.</p>
<p class="warn">En France, le feu en forêt est souvent interdit (risque d'incendie l'été). Ne l'utilise qu'en vraie situation de survie et éteins-le complètement à l'eau et à la terre.</p>` },

{ id: 'plantes', cat: 'manger', titre: 'Plantes comestibles de France', mots: 'manger plante comestible cueillir faim ortie pissenlit ail mûre châtaigne',
  corps: `<p class="warn">Règle d'or : <b>dans le doute, ne mange pas.</b> Jamais de champignons. Jamais d'ombellifères (fleurs en parasol, famille de la ciguë, mortelle).</p>
<ul><li><b>Ortie</b> (printemps–automne) : jeunes feuilles cuites ou froissées. Sans sosie dangereux.</li>
<li><b>Pissenlit</b> : feuilles et fleurs crues.</li>
<li><b>Plantain</b> : jeunes feuilles.</li>
<li><b>Mûres, framboises, myrtilles, fraises des bois</b> (été) : seulement si tu es sûr.</li>
<li><b>Châtaignes</b> (automne) : bogue très piquante. Sosie toxique : le marron d'Inde (bogue à quelques piquants espacés).</li>
<li><b>Noisettes, faines</b> (automne).</li>
<li><b>Ail des ours</b> (printemps) : odeur d'ail obligatoire. Sosies mortels : muguet, colchique, arum.</li></ul>
<p class="note">Lave ou cuis les baies cueillies près du sol (parasite du renard).</p>` },

{ id: 'proteines', cat: 'manger', titre: 'Insectes, pêche, autres sources', mots: 'insecte pêche poisson protéine manger chasse piège',
  corps: `<ul><li><b>Insectes</b> : sauterelles, grillons, vers de terre, larves sous les écorces. Toujours cuits. Évite les insectes très colorés, poilus ou qui sentent fort.</li>
<li><b>Pêche</b> : ligne et hameçon de fortune (épingle, fil). Le poisson se mange bien cuit.</li>
<li><b>Escargots</b> : bien cuits uniquement.</li></ul>
<p class="warn">La chasse, le piégeage et la pêche sont réglementés en France. En survie réelle, ta vie passe avant, mais pas en randonnée normale.</p>` },

{ id: 'rcp', cat: 'soins', titre: 'Massage cardiaque', mots: 'massage cardiaque arrêt cœur rcp respire pas inconscient réanimation',
  corps: `<ol><li>Il ne répond pas et ne respire pas normalement : <b>appelle le 15 ou le 112</b>, haut-parleur.</li>
<li>Allonge-le sur le dos, sur un sol dur.</li>
<li>Talon des mains au centre de la poitrine, bras tendus.</li>
<li>Enfonce de <b>5 à 6 cm</b>, au rythme de <b>100 à 120 par minute</b>. Utilise le métronome ci-dessous.</li>
<li>Ne t'arrête pas jusqu'aux secours ou un défibrillateur.</li></ol>`, outil: 'metronome' },

{ id: 'hemorragie', cat: 'soins', titre: 'Saignement abondant', mots: 'saigne sang hémorragie plaie coupure garrot blessure',
  corps: `<ol><li><b>Appuie fort</b> directement sur la plaie, avec un tissu ou la main. Ne relâche pas.</li>
<li>Allonge la personne, couvre-la.</li>
<li>Si ça ne s'arrête pas (membre) : <b>garrot</b> 5 à 7 cm au-dessus de la plaie, serré jusqu'à l'arrêt du saignement. <b>Note l'heure.</b> Ne le desserre jamais toi-même.</li>
<li>Appelle le 15 ou le 112.</li></ol>` },

{ id: 'hypothermie', cat: 'soins', titre: 'Hypothermie', mots: 'froid hypothermie frisson tremble gelé confus',
  corps: `<p><b>Signes</b> : frissons intenses, mains maladroites, puis confusion, paroles lentes, somnolence. <b>Si les frissons s'arrêtent alors qu'il fait toujours froid, c'est grave.</b></p>
<ol><li>À l'abri du vent, isolé du sol.</li><li>Retire les vêtements mouillés, mets du sec, couverture de survie, bonnet.</li>
<li>Boisson chaude et sucrée seulement s'il est bien conscient.</li><li>Ne frictionne pas, pas d'alcool. Bouge-le doucement.</li><li>Corps à corps dans un sac de couchage si possible.</li></ol>` },

{ id: 'chaleur', cat: 'soins', titre: 'Coup de chaleur', mots: 'chaleur coup soleil chaud déshydratation insolation fièvre',
  corps: `<p><b>Signes</b> : peau très chaude, maux de tête, nausées, confusion, plus de sueur.</p>
<ol><li>À l'ombre, allongé.</li><li>Refroidis : eau sur la peau, ventile, linges mouillés au cou, aisselles, aine.</li><li>Petites gorgées d'eau s'il est conscient.</li><li>Confusion : appelle le 15, c'est une urgence vitale.</li></ol>` },

{ id: 'vipere', cat: 'soins', titre: 'Morsure de vipère', mots: 'vipère serpent morsure piqûre venin',
  corps: `<ol><li>Reste calme, allonge-toi, bouge le moins possible.</li><li>Retire bagues, montre, bracelets.</li><li>Immobilise le membre comme pour une fracture.</li><li>Appelle le 15 ou le 112.</li></ol>
<p class="warn">Pas de garrot, pas d'incision, pas d'aspiration, pas de glace, pas d'alcool.</p>
<p class="note">En France, les morsures sont rarement mortelles mais demandent toujours un avis médical.</p>` },

{ id: 'fracture', cat: 'soins', titre: 'Entorse et fracture', mots: 'fracture entorse cassé foulure cheville jambe bras attelle',
  corps: `<ul><li>Ne bouge pas un membre déformé. Immobilise-le dans la position trouvée : bâtons, branches, carton, rembourrés avec des vêtements.</li>
<li>L'attelle doit bloquer l'articulation au-dessus et en dessous.</li>
<li>Entorse : serre avec un bandage, surélève, du froid si possible.</li>
<li>Douleur au dos ou au cou après une chute : <b>ne déplace pas la personne</b>, appelle le 112.</li></ul>` },

{ id: 'brulure', cat: 'soins', titre: 'Brûlure', mots: 'brûlure brûlé feu eau chaude',
  corps: `<ul><li>Eau tempérée sur la brûlure <b>pendant 15 minutes</b>.</li><li>Retire bagues et vêtements non collés.</li><li>Couvre avec un linge propre ou film plastique.</li><li>Plus grande que la paume de la main, ou au visage : appelle le 15.</li></ul>` },

{ id: 'tique', cat: 'soins', titre: 'Tiques', mots: 'tique piqûre lyme',
  corps: `<ul><li>Retire-la vite avec un tire-tique en tournant, ou une pince fine au ras de la peau. Pas d'éther ni d'huile.</li>
<li>Désinfecte, note la date.</li><li>Une plaque rouge qui s'étend dans les 30 jours : consulte un médecin (maladie de Lyme).</li></ul>` },

{ id: 'mam', cat: 'montagne', titre: 'Mal aigu des montagnes', mots: 'altitude mal montagne tête nausée mam oedème essoufflé',
  corps: `<p>Au-dessus de 2 500 m : <b>mal de tête</b> avec nausées, fatigue, vertiges ou mauvais sommeil.</p>
<ul><li>Ne monte plus. Repos, eau, antidouleur simple.</li><li>Ça s'aggrave : <b>descends</b> de 500 à 1 000 m.</li>
<li><b>Urgence absolue, descends tout de suite</b> : essoufflement au repos, toux, lèvres bleues, confusion, marche instable.</li></ul>
<p class="note">Au-dessus de 3 000 m, ne dors pas plus de 300 à 500 m plus haut que la nuit précédente.</p>` },

{ id: 'avalanche', cat: 'montagne', titre: 'Avalanche', mots: 'avalanche neige pente ski dva bulletin',
  corps: `<ul><li>Avant : consulte le <b>bulletin d'estimation du risque d'avalanche</b> (Météo-France). Porte DVA, pelle, sonde.</li>
<li>Les pentes de <b>30 à 45°</b> sont les plus dangereuses.</li>
<li>Pris : débarrasse-toi des bâtons, essaie de sortir sur le côté, « nage » pour rester en surface. Avant l'arrêt, protège ton visage pour garder une poche d'air.</li>
<li>Témoin : repère le dernier point où tu as vu la personne, appelle le 112, cherche en aval avec le DVA. Les 15 premières minutes sont décisives.</li></ul>` },

{ id: 'orage', cat: 'montagne', titre: 'Orage et foudre', mots: 'orage foudre éclair tonnerre pluie',
  corps: `<ul><li>Compte les secondes entre l'éclair et le tonnerre, <b>divise par 3</b> : distance en km. Moins de 30 secondes : mets-toi à l'abri.</li>
<li>Quitte crêtes, sommets, arêtes. Lâche les objets métalliques (bâtons, piolet).</li>
<li>Jamais sous un arbre isolé. En forêt, reste sous les arbres bas, loin des plus grands.</li>
<li>Accroupis-toi, pieds joints, sur ton sac. En groupe, écartez-vous de quelques mètres.</li>
<li>Attends 30 minutes après le dernier tonnerre.</li></ul>`, outil: 'orage' },

{ id: 'demitour', cat: 'montagne', titre: 'Savoir faire demi-tour', mots: 'demi-tour heure retour sommet décision',
  corps: `<ul><li>Fixe une <b>heure limite</b> avant de partir. À cette heure, tu fais demi-tour, sommet atteint ou pas.</li>
<li>La descente prend souvent plus de temps et d'énergie qu'on pense.</li>
<li>Météo qui se gâte, quelqu'un qui fatigue, retard : on renonce. La montagne sera encore là.</li></ul>` },

{ id: 'soleil-nord', cat: 'orient', titre: 'Trouver le nord sans boussole', mots: 'nord sud orientation soleil montre étoile polaire direction',
  corps: `<ul><li><b>Le soleil</b> se lève à l'est, est au sud vers 13 h–14 h (heure d'été) ou 12 h–13 h (heure d'hiver), se couche à l'ouest.</li>
<li><b>Montre à aiguilles</b> : pointe la petite aiguille vers le soleil. Le sud est au milieu entre elle et le 12 (le 1 en heure d'été).</li>
<li><b>Étoile polaire</b> : prolonge 5 fois le bord de la « casserole » (Grande Ourse). Elle indique le nord.</li>
<li><b>Ombre</b> : plante un bâton, marque le bout de l'ombre, attends 15 min, marque encore. La ligne va de l'ouest (1re marque) à l'est.</li></ul>
<p class="note">La mousse sur les arbres n'est pas un repère fiable.</p>` },

{ id: 'civilisation', cat: 'orient', titre: 'Retrouver la civilisation', mots: 'civilisation village route trouver sortir humain chemin',
  corps: `<ul><li>T’es où ? t'indique en continu le <b>lieu habité le plus proche</b> et si tu t'en rapproches.</li>
<li>Signes de présence humaine : sentiers, balisage, clôtures, lignes électriques, bruit de moteur, chiens, cloches, fumée, lumières la nuit.</li>
<li>Un <b>sentier</b> mène presque toujours quelque part. Suis-le plutôt que de couper à travers.</li>
<li>Méfiance : suivre un ruisseau vers le bas peut mener à une cascade ou un ravin.</li>
<li>Monter sur une hauteur aide à voir loin et à capter du réseau.</li></ul>` },

{ id: 'signaux', cat: 'signal', titre: 'Signaux de détresse', mots: 'signal détresse sos hélicoptère sifflet miroir sol',
  corps: `<ul><li><b>Le chiffre 3</b> signifie détresse : 3 coups de sifflet, 3 feux, 3 tas.</li>
<li><b>Signal de montagne</b> : 6 signaux par minute (sifflet, lumière), 1 minute de pause, et on recommence. Réponse : 3 par minute.</li>
<li><b>Au sol</b>, lettres d'au moins 3 m, contrastées (pierres, branches) : <b>V</b> besoin d'aide · <b>X</b> besoin d'un médecin · <b>→</b> partis dans cette direction.</li>
<li><b>Hélicoptère</b> : les deux bras levés en Y = « oui, besoin d'aide ». Un bras levé, l'autre baissé = « non ».</li>
<li><b>Miroir</b> ou écran : vise l'avion entre deux doigts en V et fais passer le reflet dessus.</li>
<li>Couleurs vives étalées dans une clairière, fumée blanche le jour (feuilles vertes sur le feu).</li></ul>` },

{ id: 'patou', cat: 'animaux', titre: 'Chiens de troupeau (patous)', mots: 'patou chien troupeau mouton berger aboie',
  corps: `<p>Très fréquents en montagne l'été. Ils protègent le troupeau, ils ne chassent pas les randonneurs.</p>
<ul><li>Contourne largement le troupeau.</li><li>Si le chien vient : arrête-toi, reste calme, parle doucement, ne le fixe pas, ne cours pas.</li><li>Mets ton bâton ou ton sac entre vous, sans geste menaçant. Repars lentement quand il se calme.</li><li>Descends du vélo et pousse-le.</li></ul>` },

{ id: 'ours-loup', cat: 'animaux', titre: 'Ours, loups, sangliers', mots: 'ours loup sanglier animal sauvage danger attaque',
  corps: `<ul><li><b>Ours brun</b> (Pyrénées) : très rare de le croiser. Parle fort en marchant. Face à lui, ne cours pas, recule lentement en parlant calmement. Range la nourriture loin de ta tente.</li>
<li><b>Loup</b> (Alpes, Provence, Massif central, Jura, Vosges, Pyrénées) : il fuit l'humain. Garde ton chien en laisse.</li>
<li><b>Sanglier</b> : dangereux surtout une laie avec petits ou un animal blessé. Éloigne-toi, monte sur un rocher si besoin.</li>
<li><b>Frelons, guêpes</b> : piqûre dans la gorge ou malaise : 15.</li>
<li><b>Chenilles processionnaires</b> (pins, chênes) : ne touche pas, poils très irritants.</li></ul>` },

{ id: 'potager', cat: 'potager', titre: 'Quoi planter pour tenir', mots: 'planter potager graine semer cultiver légume récolte autonomie',
  corps: `<p>Ce qui pousse le plus vite en France :</p>
<ul><li><b>Radis</b> : récolte en 25 à 30 jours (mars → octobre).</li>
<li><b>Roquette, mâche</b> : 30 à 40 jours.</li><li><b>Épinards, laitues</b> : 45 à 60 jours.</li>
<li><b>Haricots verts</b> : 60 jours (après les dernières gelées, mi-mai).</li>
<li><b>Courgettes</b> : 50 à 60 jours, très productives.</li>
<li><b>Pommes de terre</b> : 90 à 120 jours, très nourrissantes, se conservent.</li></ul>
<p><b>Selon le climat</b> : au bord de la Méditerranée, on sème 2 à 4 semaines plus tôt. En montagne et dans le Nord-Est, 2 à 4 semaines plus tard, et pas avant les « Saints de glace » (mi-mai) pour les légumes frileux.</p>
<p class="note">Garde toujours une partie des graines de la récolte pour l'année suivante.</p>`, outil: 'semis' },

{ id: 'voyage', cat: 'voyage', titre: 'Voyager en France', mots: 'voyage touriste étranger ambassade urgence pharmacie',
  corps: `<ul><li><b>112</b> fonctionne partout, opérateurs anglophones disponibles.</li>
<li><b>Pharmacie de garde</b> : affichée sur la porte de chaque pharmacie.</li>
<li>L'eau du robinet est potable en France, sauf panneau « eau non potable » sur les fontaines.</li>
<li>Garde une photocopie de ton passeport et le numéro de ton ambassade dans <b>Moi › Fiche</b>.</li></ul>` },
];

FICHES.push(
{ id: 'homme-mer', cat: 'mer', titre: 'Homme à la mer', mots: 'homme mer tombé eau bateau chute équipier mob',
  corps: `<ol><li><b>Crie</b> « Un homme à la mer ! » et appuie sur <b>Homme à la mer</b> dans T’es où ? : la position est enregistrée et la flèche te ramène dessus.</li>
<li><b>Désigne quelqu'un</b> qui le montre du doigt sans jamais le quitter des yeux.</li>
<li><b>Lance</b> bouée, perche IOR, tout ce qui flotte.</li>
<li><b>Alerte</b> : VHF canal 16 (MAYDAY) ou bouton rouge ASN/DSC, sinon 196 (CROSS) ou 112.</li>
<li><b>Reviens</b> sur lui lentement, par-dessous le vent, moteur au point mort à l'approche (hélice).</li></ol>
<p class="note">La nuit ou par mer formée, on perd quelqu'un de vue en quelques secondes. Le point GPS enregistré tout de suite fait souvent la différence.</p>` },

{ id: 'mayday', cat: 'mer', titre: 'Appel MAYDAY à la VHF', mots: 'mayday vhf radio canal 16 cross détresse appel pan pan',
  corps: `<p><b>Canal 16</b>, puissance maximale. Si ta VHF a l'ASN (DSC) : maintiens le bouton rouge « Distress » 5 secondes, puis parle sur le 16.</p>
<ol><li>« <b>MAYDAY MAYDAY MAYDAY</b> »</li><li>« Ici <i>nom du bateau</i> » (3 fois), indicatif, MMSI</li>
<li>« MAYDAY <i>nom du bateau</i> »</li><li><b>Position</b> : coordonnées affichées dans l'onglet SOS</li>
<li><b>Nature de la détresse</b> (voie d'eau, feu, homme à la mer…) et <b>aide demandée</b></li>
<li><b>Nombre de personnes</b>, autres infos (radeau, gilets)</li><li>« <b>À vous</b> »</li></ol>
<p><b>PAN PAN</b> (3 fois) : urgence sans danger immédiat de mort (avarie, blessé). <b>Sécurité</b> : avis météo ou danger pour la navigation.</p>
<p class="note">Sans VHF : le <b>196</b> joint le CROSS depuis un téléphone, si le réseau passe (souvent jusqu'à 10–20 km des côtes).</p>` },

{ id: 'eau-froide', cat: 'mer', titre: 'Tomber dans l\'eau froide', mots: 'eau froide tombé hypothermie noyade choc thermique flotter',
  corps: `<p><b>Règle 1 · 10 · 1</b> :</p>
<ul><li><b>1 minute</b> de choc thermique : souffle coupé. Ne panique pas, contrôle ta respiration, garde la tête hors de l'eau.</li>
<li><b>10 minutes</b> de mouvements utiles avant que les mains ne répondent plus : remonte, attrape quelque chose, attache-toi.</li>
<li><b>1 heure</b> environ avant de perdre connaissance par hypothermie (variable selon l'eau et le gilet).</li></ul>
<p>Seul : <b>position fœtale</b>, genoux ramenés, bras serrés. À plusieurs : serrez-vous en cercle. Ne nage pas pour rien, ça refroidit plus vite.</p>` },

{ id: 'survie-mer', cat: 'mer', titre: 'Survie en mer et radeau', mots: 'radeau naufrage chavirage survie mer boire eau mer abandon',
  corps: `<ul><li><b>Reste avec le bateau</b> tant qu'il flotte : il est bien plus visible qu'une tête dans l'eau.</li>
<li>N'abandonne le navire que pour <b>monter</b> dans le radeau.</li>
<li>Dans le radeau : attache-toi, écope, garde-toi au sec, protège-toi du soleil et du vent.</li>
<li><b>Ne bois jamais d'eau de mer</b> ni d'urine. Rationne l'eau douce, récupère la pluie.</li>
<li>Garde fusées et feux pour le moment où tu vois ou entends un bateau ou un avion.</li></ul>` },

{ id: 'signaux-mer', cat: 'mer', titre: 'Signaux de détresse en mer', mots: 'fusée feu main fumigène signal détresse mer bras',
  corps: `<ul><li><b>Fusée parachute rouge</b> : vue de loin (alerte).</li>
<li><b>Feu à main rouge</b> : quand les secours approchent, pour montrer ta position.</li>
<li><b>Fumigène orange</b> : de jour, très visible d'un avion ou d'un hélicoptère.</li>
<li><b>Bras tendus levés et abaissés lentement</b> : signal de détresse international.</li>
<li>Lampe, miroir, sifflet, et le <b>SOS lumineux</b> de T’es où ?</li></ul>
<p class="warn">Tiens les feux à main sous le vent, bras tendu, et ne regarde pas la flamme.</p>` },

{ id: 'mal-de-mer', cat: 'mer', titre: 'Mal de mer', mots: 'mal mer nausée vomir bateau',
  corps: `<ul><li>Reste sur le pont, au centre du bateau, et regarde l'horizon.</li><li>Air frais, pas de lecture ni d'écran.</li>
<li>Mange léger et salé, bois souvent par petites gorgées.</li><li>Prends la barre si tu peux : anticiper les mouvements aide.</li>
<li>Vomissements répétés : déshydratation rapide, surveille-la.</li></ul>` },

{ id: 'beaufort', cat: 'meteo', titre: 'Échelle de Beaufort', mots: 'beaufort vent force nœuds mer vague',
  corps: `<table class="tbl"><tr><th>Force</th><th>Nœuds</th><th>Mer</th></tr>
<tr><td>0–2</td><td>0–6</td><td>Calme, vaguelettes</td></tr><tr><td>3</td><td>7–10</td><td>Petite brise, quelques moutons</td></tr>
<tr><td>4</td><td>11–16</td><td>Jolie brise, moutons nombreux</td></tr><tr><td>5</td><td>17–21</td><td>Bonne brise, embruns</td></tr>
<tr><td>6</td><td>22–27</td><td>Vent frais : prudence, réduire la toile</td></tr><tr><td>7</td><td>28–33</td><td>Grand frais : rester au port</td></tr>
<tr><td>8</td><td>34–40</td><td>Coup de vent</td></tr><tr><td>9</td><td>41–47</td><td>Fort coup de vent</td></tr>
<tr><td>10+</td><td>48 +</td><td>Tempête</td></tr></table>` },

{ id: 'meteo-signes', cat: 'meteo', titre: 'Lire le temps sans prévisions', mots: 'météo temps nuage baromètre pression orage prévoir ciel',
  corps: `<ul><li><b>La pression baisse de plus de 3 hPa en 3 h</b> : dégradation rapide, vent fort probable.</li>
<li><b>Cirrus en crochets, halo autour du soleil ou de la lune</b> : perturbation dans 12 à 24 h.</li>
<li><b>Cumulus qui gonflent vite en tours</b> l'après-midi, puis <b>enclume</b> : orage dans l'heure.</li>
<li><b>Houle qui grossit sans vent</b> : tempête au loin, elle peut arriver.</li>
<li><b>Vent qui tourne brusquement</b> et fraîchit : passage d'un front.</li>
<li><b>Brouillard du matin</b> qui se lève tôt : souvent beau temps.</li></ul>
<p class="note">La météo téléchargée dans T’es où ? montre aussi l'évolution de la pression prévue.</p>` },
);

// Animaux présents selon le département (zones principales, simplifié)
const OURS = ['09', '31', '64', '65', '66', '11'];
const LOUP = ['04', '05', '06', '26', '38', '73', '74', '83', '84', '01', '39', '25', '88', '68', '67', '48', '12', '15', '43', '63', '66', '11', '09', '30', '34', '07'];
export function risquesLocaux(dep) {
  const r = ['Vipères possibles partout : regarde où tu poses mains et pieds.', 'Tiques dans les herbes hautes.'];
  if (OURS.includes(dep)) r.unshift('Zone à ours brun (Pyrénées) : fais du bruit en marchant, range la nourriture loin de toi.');
  if (LOUP.includes(dep)) r.push('Zone à loups : ils évitent l\'humain. Patous fréquents près des troupeaux.');
  return r;
}
