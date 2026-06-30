"""
Resolución ciudad → provincia → zona para la tarifa DHL.

La factura DHL trae el nombre de la ciudad (truncado a ~9 caracteres y a veces
con caracteres mal codificados), sin código postal. La tarifa agrupa PROVINCIAS
en zonas. Aquí mapeamos ciudad → provincia; la zona sale del mapa de la tarifa.

Cobertura parcial por diseño: cubre capitales + las ciudades frecuentes de las
facturas Doccia. Lo no cubierto se marca para revisión y se puede ampliar aquí
(CIUDAD_PROVINCIA) o detectarse como internacional (PAIS_EXTRANJERO).
"""

from normalizer import normalize_str as _norm


# ── Provincias (clave normalizada como en el mapa de la tarifa) ───────────────
# Capitales y nombre de provincia → provincia normalizada.
PROVINCIAS = {
    "sevilla", "cordoba", "huelva", "cadiz", "malaga", "jaen", "granada", "almeria",
    "badajoz", "caceres", "albacete", "alicante", "avila", "cuenca", "guadalajara",
    "madrid", "murcia", "salamanca", "segovia", "toledo", "valladolid", "valencia",
    "zamora", "asturias", "cantabria", "gerona", "huesca", "la coruna", "lerida",
    "lugo", "orense", "pontevedra", "vizcaya", "alava", "burgos", "castellon",
    "leon", "palencia", "soria", "teruel", "zaragoza", "ciudad real", "barcelona",
    "guipuzcoa", "la rioja", "navarra", "tarragona", "baleares", "ourense",
}

# Ciudad (normalizada, posiblemente truncada) → provincia (normalizada)
CIUDAD_PROVINCIA = {
    # Asturias
    "lugones": "asturias", "gijon": "asturias", "aviles": "asturias", "avil": "asturias",
    "siero": "asturias", "grado": "asturias", "llanera": "asturias", "navia": "asturias",
    "valdes": "asturias", "pola de": "asturias", "sotrondio": "asturias", "lada": "asturias",
    "carreno": "asturias", "tremanes": "asturias", "sariego": "asturias", "vega de a": "asturias",
    "las vegas": "asturias",
    # Baleares (zona 10)
    "manacor": "baleares", "palma": "baleares", "palma de": "baleares", "p.mallorc": "baleares",
    "inca": "baleares", "llucmajor": "baleares", "sa pobla": "baleares", "capdepera": "baleares",
    "porreres": "baleares", "muro": "baleares", "el arenal": "baleares", "cas conco": "baleares",
    "mao": "baleares", "mahon": "baleares", "eivissa": "baleares", "ibiza": "baleares",
    "formenter": "baleares",
    # Cuenca / Albacete / CLM
    "cuenca": "cuenca", "tarancon": "cuenca", "minglanil": "cuenca", "motilla d": "cuenca",
    "iniesta": "cuenca", "mota del": "cuenca",
    "albacete": "albacete", "hellin": "albacete", "almansa": "albacete", "la roda": "albacete",
    "tobarra": "albacete", "mahora": "albacete", "munera": "albacete", "ontur": "albacete",
    "abenjibre": "albacete", "el bonillo": "albacete", "bonillo": "albacete", "ruidera": "albacete",
    # Alicante
    "alicante": "alicante", "elche": "alicante", "elx": "alicante", "benissa": "alicante",
    "villena": "alicante", "torreviej": "alicante", "denia": "alicante", "javea": "alicante",
    "ibi": "alicante", "orihuela": "alicante", "catral": "alicante", "rojales": "alicante",
    "pilar de": "alicante", "orba": "alicante", "la nucia": "alicante", "nucia": "alicante",
    "benidorm": "alicante", "beniidorm": "alicante", "novelda": "alicante", "pego": "alicante",
    "castalla": "alicante", "sax": "alicante", "muchamiel": "alicante", "crevillen": "alicante",
    "guardamar": "alicante", "san isidr": "alicante", "benejuzar": "alicante", "santa pol": "alicante",
    "san vicen": "alicante", "algueña": "alicante", "alguena": "alicante", "benej": "alicante",
    # Madrid
    "madrid": "madrid", "getafe": "madrid", "colmenar": "madrid", "alcorcon": "madrid",
    "leganes": "madrid", "parla": "madrid", "aranjuez": "madrid", "las torre": "madrid",
    "san loren": "madrid", "san loren": "madrid",
    # Toledo
    "toledo": "toledo", "talavera": "toledo", "torrijos": "toledo", "illescas": "toledo",
    "lagartera": "toledo", "consuegra": "toledo", "bargas": "toledo", "olias del": "toledo",
    "sesena": "toledo", "seseña": "toledo", "escalona": "toledo", "villacana": "toledo",
    "nambroca": "toledo", "mocejon": "toledo", "torrico": "toledo", "camarenil": "toledo",
    "valmojado": "toledo", "layos": "toledo", "oropesa": "toledo", "los yeben": "toledo",
    "pepino": "toledo", "los naval": "toledo", "villaluen": "toledo", "fuensalda": "toledo",
    # Ciudad Real (zona 8)
    "ciudad re": "ciudad real", "ciudad ro": "ciudad real", "puertolla": "ciudad real",
    "manzanare": "ciudad real", "almodovar": "ciudad real", "daimiel": "ciudad real",
    "tomelloso": "ciudad real", "migueltur": "ciudad real", "valdepe": "ciudad real",
    "valdepena": "ciudad real", "bolanos d": "ciudad real", "bolaños d": "ciudad real",
    "torrenuev": "ciudad real", "el viso d": "ciudad real", "villarta": "ciudad real",
    # Guadalajara
    "guadalaja": "guadalajara", "azuqueca": "guadalajara", "chiloeche": "guadalajara",
    "siguenza": "guadalajara", "sacedon": "guadalajara", "marchamal": "guadalajara",
    "yunquera": "guadalajara", "atienza": "guadalajara",
    # Salamanca
    "salamanca": "salamanca", "guijuelo": "salamanca", "bejar": "salamanca", "tamames": "salamanca",
    "alba de t": "salamanca", "penaranda": "salamanca", "peñaranda": "salamanca",
    "carbajosa": "salamanca", "villaviej": "salamanca", "aldeatej": "salamanca", "aladeatej": "salamanca",
    # Ávila
    "avila": "avila", "las navas": "avila", "piedrahit": "avila", "la adrada": "avila",
    "candeleda": "avila", "arenas de": "avila", "sotillo": "avila", "narros de": "avila",
    "navalvill": "avila", "piedralav": "avila", "la villa": "avila",
    # Segovia
    "segovia": "segovia", "cuellar": "segovia", "cantalejo": "segovia", "el espina": "segovia",
    "ayllon": "segovia", "samboal": "segovia", "sanchidri": "segovia",
    # Valladolid
    "valladoli": "valladolid", "medina de": "valladolid", "medina ri": "valladolid",
    "iscar": "valladolid", "mojados": "valladolid", "tordesill": "valladolid",
    "pedrajas": "valladolid", "alaejos": "valladolid", "penafiel": "valladolid", "peñafiel": "valladolid",
    "villabrag": "valladolid", "santoveni": "valladolid", "vlba.duer": "valladolid", "fresno el": "valladolid",
    # Zamora
    "zamora": "zamora", "bermillo": "zamora", "corrales": "zamora", "la boveda": "zamora",
    # Badajoz
    "badajoz": "badajoz", "zafra": "badajoz", "merida": "badajoz", "don benit": "badajoz",
    "don beni": "badajoz", "montijo": "badajoz", "almendral": "badajoz", "aceuchal": "badajoz",
    "llerena": "badajoz", "azuaga": "badajoz", "calamonte": "badajoz", "zalamea d": "badajoz",
    "campanari": "badajoz", "maguilla": "badajoz", "guarena": "badajoz", "guareña": "badajoz",
    "villafran": "badajoz", "higuera d": "badajoz", "burguillo": "badajoz", "monterrub": "badajoz",
    "fuente el": "badajoz", "valle del": "badajoz", "ribera de": "badajoz",
    # Cáceres
    "caceres": "caceres", "c ceres": "caceres", "plasencia": "caceres", "miajadas": "caceres",
    "moraleja": "caceres", "trujillo": "caceres", "navalmora": "caceres", "jaraiz de": "caceres",
    "almoharin": "caceres", "coria": "caceres", "alcantara": "caceres", "eljas": "caceres",
    "mohedas d": "caceres", "monteherm": "caceres", "zarza la": "caceres", "zarza de": "caceres",
    "pinofranq": "caceres", "herrera d": "badajoz", "valencia de alc": "caceres",
    "zarza cap": "caceres", "pesga": "caceres", "la pesga": "caceres", "valdelaca": "caceres",
    "valdelafu": "caceres", "barco de": "caceres", "v de alc": "caceres", "valencia de alc": "caceres",
    # Huelva
    "huelva": "huelva", "bollullos": "huelva", "gibraleon": "huelva", "valverde": "huelva",
    "rio tinto": "huelva", "punta umb": "huelva", "isla cris": "huelva", "zalamea": "huelva",
    # Sevilla
    "sevilla": "sevilla", "dos herma": "sevilla", "moron de": "sevilla", "guadalcan": "sevilla",
    "el coroni": "sevilla", "los barri": "cadiz",   # Los Barrios = Cádiz
    "constanti": "sevilla", "el viso": "sevilla",
    # Cádiz
    "cadiz": "cadiz", "jerez": "cadiz", "la linea": "cadiz", "algeciras": "cadiz",
    "vejer de": "cadiz", "el puerto": "cadiz",
    # Córdoba
    "cordoba": "cordoba", "lucena": "cordoba", "cabra": "cordoba", "montilla": "cordoba",
    "puente ge": "cordoba", "pedroñer": "cordoba", "pedroner": "cordoba",
    # Málaga / Granada / Jaén / Almería
    "malaga": "malaga", "granada": "granada", "guadix": "granada", "maracena": "granada",
    "jaen": "jaen", "bailen": "jaen", "ubeda": "jaen",
    "almeria": "almeria", "zujar": "granada",
    # Murcia
    "murcia": "murcia", "mazarron": "murcia", "cartagena": "murcia", "aguilas": "murcia",
    "totana": "murcia", "bullas": "murcia", "caravaca": "murcia", "calasparr": "murcia",
    "moratalla": "murcia", "abanilla": "murcia", "alhama de": "murcia", "lorqui": "murcia",
    "mula": "murcia", "la union": "murcia", "el raal": "murcia", "sangonera": "murcia",
    "zarandona": "murcia", "la copa d": "murcia", "fuente al": "murcia", "alcantari": "murcia",
    # Valencia / Castellón
    "valencia": "valencia", "castellon": "castellon", "vila real": "castellon", "vila-real": "castellon",
    "onda": "castellon", "oropesa/o": "castellon", "montanejo": "castellon",
    "orba": "alicante", "els poble": "alicante", "el poble": "alicante",
    # La Coruña
    "la coruna": "la coruna", "a coruna": "la coruna", "coruna": "la coruna", "coru a": "la coruna",
    "la coru a": "la coruna", "a coru a": "la coruna", "xove": "lugo", "pe aranda": "salamanca",
    "carballi": "orense", "o carball": "orense", "ribadeo": "lugo", "vivero": "lugo", "viveiro": "lugo",
    "carballo": "la coruna", "cerceda": "la coruna", "santiago": "la coruna", "betanzos": "la coruna",
    "boiro": "la coruna", "naron": "la coruna", "naron": "la coruna", "el ferrol": "la coruna",
    "ferrol": "la coruna", "ares": "la coruna", "sada": "la coruna", "negreira": "la coruna",
    "cambre": "la coruna", "culleredo": "la coruna", "ortigueir": "la coruna", "padron": "la coruna",
    "cerceda": "la coruna", "melide": "la coruna", "noia": "la coruna",
    "teixeiro": "la coruna", "cortiguer": "la coruna", "pontecesu": "la coruna", "a silva": "la coruna",
    # Lugo
    "lugo": "lugo", "monforte": "lugo", "barreiros": "lugo", "rabade": "lugo", "burela": "lugo",
    "foz": "lugo", "palas de": "lugo", "chantada": "lugo", "covas viv": "lugo", "jarrio": "asturias",
    # Ourense
    "ourense": "ourense", "orense": "ourense", "verin": "ourense", "celanova": "ourense",
    "maside": "ourense", "carballi": "ourense", "allariz": "ourense", "pontedeva": "ourense",
    "la gudina": "ourense", "la gudi a": "ourense", "ribadavia": "ourense", "o barco d": "ourense",
    "barco de v": "ourense", "a rua": "ourense", "sobreira": "ourense", "o carball": "ourense",
    # Pontevedra
    "pontevedr": "pontevedra", "vigo": "pontevedra", "estrada": "pontevedra", "a estrada": "pontevedra",
    "lalin": "pontevedra", "pontearea": "pontevedra", "portonovo": "pontevedra", "mos": "pontevedra",
    "arbo": "pontevedra", "as neves": "pontevedra", "villalong": "pontevedra", "porto novo": "pontevedra",
    # León
    "leon": "leon", "le n": "leon", "le�n": "leon", "astorga": "leon", "ponferrad": "leon",
    "la baneza": "leon", "la ba eza": "leon", "bembibre": "leon", "trobajo d": "leon",
    "carrizo d": "leon", "san justo": "leon", "villager": "leon", "valcavado": "leon",
    "huerga de": "leon", "villarejo": "leon", "quintanil": "leon",
    # Palencia
    "palencia": "palencia", "osorno": "palencia", "aguilar d": "palencia", "carrion d": "palencia",
    "herrera d": "palencia", "villada": "palencia", "villarcay": "burgos",
    # Burgos
    "burgos": "burgos", "covarrubi": "burgos", "hacinas": "burgos", "ahedo de": "burgos",
    "aranda de": "burgos", "aranda": "burgos", "villadieg": "burgos", "la mata d": "burgos",
    "medina de pomar": "burgos", "renedo de": "cantabria",
    # Soria
    "soria": "soria", "san leonardo": "soria", "almazan": "soria",
    # Álava
    "vitoria": "alava", "vitoria-g": "alava", "vitoria g": "alava",
    # Vizcaya
    "bilbao": "vizcaya", "barakaldo": "vizcaya", "basauri": "vizcaya", "leioa": "vizcaya",
    "erandio": "vizcaya", "burtzena": "vizcaya", "burtzeña": "vizcaya", "santurtzi": "vizcaya",
    "sestao": "vizcaya",
    # Guipúzcoa (zona 9)
    "legazpi": "guipuzcoa", "zumarraga": "guipuzcoa", "beasain": "guipuzcoa", "zizurkil": "guipuzcoa",
    "donostia": "guipuzcoa", "oiartzun": "guipuzcoa",
    # Cantabria
    "santander": "cantabria", "torrelave": "cantabria", "ontaneda": "cantabria", "potes": "cantabria",
    "laredo": "cantabria", "noja": "cantabria", "treto": "cantabria",
    # La Rioja (zona 9)
    "logrono": "la rioja", "logro o": "la rioja", "arnedo": "la rioja", "najera": "la rioja",
    "sorzano": "la rioja", "quel": "la rioja", "santo dom": "la rioja", "rincon de": "la rioja",
    # Navarra (zona 9)
    "pamplona": "navarra", "tafalla": "navarra", "estella": "navarra", "burlada": "navarra",
    "villava": "navarra", "mutilva": "navarra", "andosilla": "navarra", "mendavia": "navarra",
    "puente la": "navarra", "berriopla": "navarra", "cordovill": "navarra", "gorraiz": "navarra",
    "elizondo": "navarra", "sunbilla": "navarra", "arizkun": "navarra", "pitillas": "navarra",
    "san adria": "navarra", "berrioplano": "navarra",
    # Zaragoza / Huesca / Teruel
    "zaragoza": "zaragoza", "jaca": "huesca", "barbastro": "huesca", "fraga": "huesca",
    "binefar": "huesca", "sabi anig": "huesca", "monzon": "huesca",
    "teruel": "teruel", "alcorisa": "teruel", "ojos negr": "teruel", "ojos negros": "teruel",
    # Barcelona (zona 9)
    "barcelona": "barcelona", "blanes": "gerona", "santa col": "barcelona",
    "sant anto": "barcelona", "esplugues": "barcelona",
    # Gerona (zona 6)
    "girona": "gerona", "gerona": "gerona", "palamos": "gerona", "palam": "gerona", "figueres": "gerona",
    "puigcerda": "gerona", "banyoles": "gerona", "cassa de": "gerona", "roses": "gerona",
    "sils": "gerona", "olot": "gerona", "ripoll": "gerona", "begur": "gerona", "esclanya": "gerona",
    "palafruge": "gerona", "calonge": "gerona", "cervia de": "gerona", "torroella": "gerona",
    "platja d": "gerona", "riudarene": "gerona", "vilablare": "gerona", "vilacolum": "gerona",
    "llanca": "gerona", "llan a": "gerona", "vall-llob": "gerona", "preses": "gerona",
    "sant juli": "gerona", "planes d": "gerona",
    # Lérida (zona 6)
    "lleida": "lerida", "lerida": "lerida", "mollerus": "lerida", "balaguer": "lerida",
    "borges bl": "lerida", "tarrega": "lerida", "agramunt": "lerida", "cervera": "lerida",
    "solsona": "lerida", "golmes": "lerida", "vielha": "lerida", "bellpuig": "lerida",
    "torrefarr": "lerida", "torre-ser": "lerida", "soses": "lerida", "olius": "lerida",
    "albares": "lerida", "pujol": "lerida",
    # Tarragona (zona 9)
    "tarragona": "tarragona", "reus": "tarragona", "cambrils": "tarragona", "vendrell": "tarragona",
    "el vendre": "tarragona", "valls": "tarragona", "amposta": "tarragona", "alcanar": "tarragona",
    "montblanc": "tarragona", "vila-seca": "tarragona", "calafell": "tarragona", "constanti": "tarragona",
    "la canonja": "tarragona", "canonja": "tarragona", "albinyana": "tarragona", "torredemb": "tarragona",
    "mora d'eb": "tarragona", "santa oli": "tarragona", "l'arbos": "tarragona", "l arbos": "tarragona",
    "la pobla": "tarragona", "espluga d": "tarragona", "roquetes": "tarragona", "sarria de": "tarragona",
    "sarri de": "tarragona", "sant carl": "tarragona", "vila seca": "tarragona", "cervera d": "tarragona",
    # ── Añadidos tras revisar facturas DHL (zona confirmada por importe) ──────
    "lloret de": "gerona", "torrepach": "murcia", "espinar": "segovia", "sese a": "toledo",
    "fuentealb": "albacete", "el herrum": "cuenca", "pozo ca a": "albacete", "algue a": "alicante",
    "beniarbei": "alicante", "v de alc": "caceres", "numancia": "toledo", "rafol de": "alicante",
    "pe afiel": "valladolid", "madriguer": "albacete", "vullpella": "gerona", "lorbe": "la coruna",
    "roda de a": "sevilla", "matamoros": "cantabria", "los galla": "almeria", "cuatro ca": "asturias",
    "santa bar": "tarragona", "torejon d": "madrid", "zarzuela": "cuenca", "quintanar": "toledo",
}

# PORTUGAL: DHL lo factura como ZONA 6 de la tarifa DOMÉSTICA (no es internacional).
# Estas ciudades se mapean a la provincia "portugal" (→ zona 6 en el mapa de tarifa).
CIUDAD_PORTUGAL = {
    "porto", "lisboa", "set bal", "setubal", "faro", "amora", "corroios", "seixal",
    "almada", "barreiro", "barcarena", "sesimbra", "palmela", "estoril", "ericeira",
    "albufeira", "loule", "quarteira", "almancil", "tavira", "portimao", "lagoa",
    "bombarral", "trofa", "lousada", "penafiel", "matosinho", "v.n. gaia", "vn gaia",
    "valenca", "valen a", "serzedo", "milheiros", "famoes", "malveira", "pontinha",
    "mem marti", "samouco", "neiva", "ancora", "rama", "charneca", "fanzeres",
    "fernao fe", "santo ant", "casal do", "a-dos-cun", "nogueira", "sobralinh",
    "sao domin", "ferreiras", "costa de", "pinhal no", "samora co", "arronches",
    "s. joao d", "vendas no", "vale da a", "estombar", "parchal", "vila fran",
    "rio de mo", "almeirim", "portalagr", "alhos ved", "pacos de", "vermoin",
    "aguas san", "palheira", "horta", "seixo", "santo isi", "uni o das",
    "vila real de santo", "castelo d", "castelo de", "lagoa", "trofa", "roge",
}

# Países extranjeros DE VERDAD (Francia/Italia): la tarifa peninsular no aplica.
CIUDAD_INTERNACIONAL = {
    "lyon", "condom", "vailhauqu", "l isle ad", "clichy", "st pierre", "st etienn",
    "vallereui", "scandiano", "rome", "milan",
}


# ── CP (2 primeros dígitos) → provincia (clave del mapa de tarifa) ────────────
# Se usa cuando SAP nos da el código postal: resolución exacta sin ambigüedad.
CP2_PROVINCIA = {
    "01": "alava", "02": "albacete", "03": "alicante", "04": "almeria", "05": "avila",
    "06": "badajoz", "07": "baleares", "08": "barcelona", "09": "burgos", "10": "caceres",
    "11": "cadiz", "12": "castellon", "13": "ciudad real", "14": "cordoba", "15": "la coruna",
    "16": "cuenca", "17": "gerona", "18": "granada", "19": "guadalajara", "20": "guipuzcoa",
    "21": "huelva", "22": "huesca", "23": "jaen", "24": "leon", "25": "lerida",
    "26": "la rioja", "27": "lugo", "28": "madrid", "29": "malaga", "30": "murcia",
    "31": "navarra", "32": "orense", "33": "asturias", "34": "palencia", "35": "las palmas",
    "36": "pontevedra", "37": "salamanca", "38": "tenerife", "39": "cantabria", "40": "segovia",
    "41": "sevilla", "42": "soria", "43": "tarragona", "44": "teruel", "45": "toledo",
    "46": "valencia", "47": "valladolid", "48": "vizcaya", "49": "zamora", "50": "zaragoza",
    "51": "ceuta", "52": "melilla",
}

# Ciudades cuyo nombre (truncado) corresponde a varias provincias posibles.
# Mientras no haya CP de SAP, se elige por descarte: la opción cuyo precio cuadra
# con el importe facturado (lógica en el motor de tarifas).
CIUDAD_AMBIGUA = {
    "talavera":  ["toledo", "badajoz"],     # de la Reina / la Real
    "valencia":  ["valencia", "caceres", "leon"],  # capital / de Alcántara / de Don Juan
    "herrera d": ["badajoz", "palencia"],   # del Duque / de Pisuerga
    "barco de":  ["orense", "avila"],        # O Barco / de Ávila
    "valverde":  ["huelva", "badajoz"],
    "santa mar": ["salamanca", "badajoz", "baleares"],
    "san pedro": ["la coruna", "soria", "madrid"],
    "villanuev": ["badajoz", "cordoba", "sevilla"],
    "puebla de": ["toledo", "badajoz", "zaragoza"],
    "pobla de":  ["valencia", "tarragona"],
    "castro de": ["lugo", "leon", "cordoba", "cadiz"],
    "sant feli": ["gerona", "barcelona"],
    "benalua":   ["granada", "gerona", "alicante"],
    "rio tinto": ["huelva", "portugal"],
    "navalvill": ["badajoz", "caceres"],
    "torrenuev": ["ciudad real", "granada"],
    "sarri de":  ["gerona", "tarragona"],
    "sarria de": ["gerona", "tarragona"],
    "sant anto": ["gerona", "barcelona", "baleares"],
    "villar de": ["caceres", "salamanca"],
    "san andre": ["barcelona", "leon"],
    "aldeanuev": ["caceres", "la rioja", "avila"],
    "cabeza de": ["badajoz", "salamanca"],
    "torrejon": ["madrid", "caceres"],
    "santa com": ["la coruna", "ourense"],
    "san pablo": ["cadiz", "toledo", "sevilla"],
    "san jose":  ["baleares", "almeria", "sevilla"],
    "arroyomol": ["madrid", "huelva"],
    "santo tom": ["segovia", "jaen"],
    "san marti": ["leon", "madrid", "caceres"],
}

# Variantes de nombre de provincia → clave usada en el mapa de la tarifa
PROVINCIA_ALIAS = {
    "ourense": "orense",
    "girona": "gerona",
    "lleida": "lerida",
    "a coruna": "la coruna",
    "coruna": "la coruna",
}

# Destinos especiales exentos / fuera de la tarifa peninsular
CIUDAD_ESPECIAL = {"melilla", "ceuta", "gibralta", "gribalta", "andorra"}


def resolve_zona(ciudad: str, provincia_zona: dict) -> tuple[str | None, str]:
    """
    Devuelve (zona, motivo). zona=None si no se puede determinar.
    motivo describe cómo se resolvió o por qué no.
    """
    c = _norm(ciudad)
    if not c:
        return None, "sin destino"

    for pref in CIUDAD_ESPECIAL:
        if c.startswith(pref):
            return None, "Ceuta/Melilla/exento (fuera tarifa peninsular)"

    # ¿Internacional?
    for pref in CIUDAD_INTERNACIONAL:
        if c == pref or c.startswith(pref) or (pref.startswith(c) and len(c) >= 4):
            return None, "internacional (fuera tarifa nacional)"

    prov = _city_to_provincia(c)
    if not prov:
        return None, f"ciudad no mapeada: '{ciudad}'"

    prov = PROVINCIA_ALIAS.get(prov, prov)
    zona = provincia_zona.get(prov)
    if not zona:
        return None, f"provincia '{prov}' sin zona en la tarifa"
    return zona, f"{prov} → Z{zona}"


def es_internacional(ciudad: str) -> bool:
    """True si el destino es extranjero (Portugal/Francia/Italia)."""
    c = _norm(ciudad)
    if not c:
        return False
    for pref in CIUDAD_INTERNACIONAL:
        if c == pref or c.startswith(pref) or (pref.startswith(c) and len(c) >= 4):
            return True
    return False


def zonas_candidatas(ciudad: str, provincia_zona: dict, cp: str | None = None) -> tuple[list[str], str]:
    """
    Devuelve (lista_de_zonas, motivo).
      · Con CP (de SAP): una única zona exacta.
      · Ciudad mapeada sin ambigüedad: una zona.
      · Ciudad ambigua: varias zonas candidatas (el motor elige por importe).
      · Internacional/exento/no mapeada: lista vacía.
    """
    # 1) CP de SAP → provincia → zona (exacto)
    if cp and len(str(cp).strip()) >= 2:
        prov = CP2_PROVINCIA.get(str(cp).strip()[:2])
        if prov:
            prov = PROVINCIA_ALIAS.get(prov, prov)
            z = provincia_zona.get(prov)
            if z:
                return [z], f"CP {str(cp)[:2]} → {prov} → Z{z} (SAP)"
            return [], f"CP {str(cp)[:2]} → {prov} sin zona en tarifa"

    c = _norm(ciudad)
    if not c:
        return [], "sin destino"

    for pref in CIUDAD_ESPECIAL:
        if c.startswith(pref):
            return [], "Ceuta/Melilla/exento (fuera tarifa peninsular)"
    for pref in CIUDAD_INTERNACIONAL:
        if c == pref or c.startswith(pref) or (pref.startswith(c) and len(c) >= 4):
            return [], "internacional (fuera tarifa nacional)"

    # 2) ¿ciudad ambigua? → varias zonas candidatas
    amb = None
    for key, provs in CIUDAD_AMBIGUA.items():
        if c == key or c.startswith(key) or (key.startswith(c) and len(c) >= 5):
            amb = (key, provs)
            break
    if amb:
        zonas = []
        for p in amb[1]:
            p = PROVINCIA_ALIAS.get(p, p)
            z = provincia_zona.get(p)
            if z and z not in zonas:
                zonas.append(z)
        if zonas:
            return zonas, f"ambigua '{amb[0]}' → opciones {amb[1]} (elegir por importe)"

    # 3) ciudad única
    prov = _city_to_provincia(c)
    if not prov:
        return [], f"ciudad no mapeada: '{ciudad}'"
    prov = PROVINCIA_ALIAS.get(prov, prov)
    z = provincia_zona.get(prov)
    if not z:
        return [], f"provincia '{prov}' sin zona en la tarifa"
    return [z], f"{prov} → Z{z}"


def _es_portugal(c: str) -> bool:
    """c normalizado: ¿es una ciudad portuguesa de la lista?"""
    for p in CIUDAD_PORTUGAL:
        if c == p or c.startswith(p) or (p.startswith(c) and len(c) >= 4):
            return True
    return False


def _city_to_provincia(c: str) -> str | None:
    """c ya viene normalizado."""
    # 1) ¿es directamente una provincia?
    if c in PROVINCIAS:
        return c
    # 2) match exacto en la tabla de ciudades
    if c in CIUDAD_PROVINCIA:
        return CIUDAD_PROVINCIA[c]
    # 2b) Portugal → provincia "portugal" (zona 6 de la tarifa doméstica)
    if _es_portugal(c):
        return "portugal"
    # 3) prefijo: la ciudad de factura está truncada → buscar clave que empiece igual
    #    (probamos primero las claves más largas para evitar falsos positivos cortos)
    cand = None
    for key in CIUDAD_PROVINCIA:
        if (c.startswith(key) or key.startswith(c)) and len(c) >= 4:
            if cand is None or len(key) > len(cand[0]):
                cand = (key, CIUDAD_PROVINCIA[key])
    if cand:
        return cand[1]
    # 4) prefijo contra nombres de provincia
    for p in PROVINCIAS:
        if p.startswith(c) and len(c) >= 4:
            return p
    return None
