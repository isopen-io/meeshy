/**
 * Les deux listes dont se compose le pseudo d'un invité qui n'en a saisi aucun
 * (`generateGuestNickname`). Leur PRODUIT fait l'espace des noms — plus de
 * 100 000 —, que le nombre final multiplie encore. Des mots ASCII, courts,
 * sans connotation : le pseudo traverse `sanitizeUsername` tel quel.
 */
export const GUEST_NICKNAME_ADJECTIVES: readonly string[] = `
  Able Active Agile Airy Alert Amber Ample Amused Ancient Apt Arctic Ardent Artful Astral Atomic
  Autumn Awake Azure Balmy Beaming Bold Bonny Bouncy Brave Breezy Bright Brisk Bronze Bubbly Calm
  Candid Carefree Caring Casual Cheery Chief Chill Chipper Chirpy Civic Classic Clean Clear Clever
  Cloudy Coastal Cobalt Comic Cool Copper Coral Cosmic Cozy Crafty Creative Crimson Crisp Crystal
  Curious Cyan Dainty Dandy Dapper Daring Dashing Dawn Dazzling Deep Deft Desert Dewy Diligent
  Dizzy Dreamy Driven Dusky Dusty Eager Early Earnest Earthy Easy Ebony Echo Elated Electric
  Elegant Elfin Emerald Epic Even Exact Fabled Fair Faithful Famous Fancy Fast Fearless Festive
  Fiery Fine Firm First Fleet Floral Fluent Flying Fond Forest Frank Free Fresh Friendly Frosty
  Funny Fuzzy Gallant Gentle Giant Giddy Gifted Glad Gleaming Glossy Glowing Golden Good Graceful
  Grand Grateful Great Green Groovy Gutsy Handy Happy Hardy Harmonic Hazel Hearty Helpful Heroic
  Hidden Honest Hopeful Humble Hushed Icy Ideal Indigo Ivory Jade Jaunty Jazzy Jolly Jovial Joyful
  Jubilant Jumbo Keen Kind Kindly Laced Large Lasting Lavish Leafy Light Lilac Limber Lime Linen
  Little Lively Lofty Lone Loyal Lucid Lucky Lunar Lush Lyric Magic Major Maple Marble Marine
  Mellow Merry Mighty Mild Mint Mirthful Misty Modern Modest Mossy Moving Mystic Narrow Native
  Neat Nifty Nimble Noble Nomad Northern Novel Oaken Ocean Olive Opal Open Orange Orchid Patient
  Peaceful Peachy Pearl Peppy Perky Placid Plain Playful Plucky Plum Polar Polite Prime Proud Pure
  Quaint Quick Quiet Radiant Rainy Rapid Rare Ready Regal Rested Rosy Royal Ruby Rustic Sable Sage
  Sandy Sapphire Scarlet Scenic Serene Sharp Shiny Silent Silken Silver Simple Sincere Sleek Smart
  Smiling Smooth Snappy Snowy Snug Solar Solid Sonic Spark Sparkly Speedy Spicy Spirited Spry
  Stable Starry Steady Stellar Still Stormy Stout Strong Sturdy Subtle Sunny Super Supple Sure
  Sweet Swift Tame Tawny Teal Tender Thrifty Tidal Tidy Timely Tiny Tireless Topaz Tranquil True
  Trusty Twilight Upbeat Urban Valiant Vast Velvet Verdant Vibrant Vivid Wandering Warm Wavy Wild
  Willing Windy Winged Winter Wise Witty Wonder Woven Young Zany Zen Zesty Zippy
`.trim().split(/\s+/);

export const GUEST_NICKNAME_NOUNS: readonly string[] = `
  Acorn Albatross Alder Alpaca Alpine Anchor Anemone Antelope Apricot Arrow Aspen Aster Atlas
  Aurora Badger Bamboo Banyan Basil Bay Bayou Beacon Beagle Bear Beaver Bee Beetle Birch Bison
  Blossom Bluebird Bluff Bobcat Bobolink Bongo Boulder Bramble Breeze Brook Buffalo Bunny
  Butterfly Cactus Camel Canary Canyon Capybara Cardinal Caribou Cascade Cavern Cedar Chamois
  Cheetah Cherry Chipmunk Cicada Clover Cobra Comet Condor Coral Cougar Cove Coyote Crane Creek
  Cricket Crow Cub Cypress Dahlia Daisy Dandelion Deer Delta Dingo Dolphin Dormouse Dove Dragon
  Dragonfly Drum Duck Dune Eagle Echo Egret Elk Elm Ember Estuary Falcon Fawn Fennel Fern Ferret
  Finch Fir Firefly Fjord Flame Flamingo Flint Fox Foxglove Frog Gazelle Gecko Geyser Gibbon
  Ginger Giraffe Glacier Glade Goose Gopher Gorge Grove Gull Harbor Hare Hawk Hazel Heath Heather
  Hedgehog Heron Hickory Hill Hippo Hollow Holly Horizon Hornet Horse Hummingbird Ibex Ibis Iguana
  Impala Inlet Iris Island Isle Ivy Jackal Jaguar Jasmine Jay Jerboa Jungle Juniper Kelp Kestrel
  Kingfisher Kite Kiwi Koala Koi Kudu Lagoon Lake Lark Laurel Lemur Leopard Lichen Lilac Lily
  Linden Lion Lizard Llama Lobster Lotus Lupine Lynx Macaw Magnolia Magpie Mallard Manatee Mango
  Mantis Maple Marlin Marmot Marsh Meadow Meerkat Mesa Mink Mist Mole Monsoon Moon Moose Moss Moth
  Mountain Mule Narwhal Nebula Newt Nightingale Nutmeg Oak Oasis Ocelot Octopus Okapi Olive Onyx
  Orca Orchard Orchid Oriole Osprey Otter Owl Oyster Palm Panda Pangolin Panther Parrot Peacock
  Pebble Pelican Penguin Peony Petal Pheasant Pigeon Pika Pine Planet Plateau Plover Pond Pony
  Poppy Possum Prairie Puffin Puma Quail Quartz Quokka Rabbit Raccoon Rain Rapids Raven Reed Reef
  Reindeer Ridge River Robin Rose Saffron Sage Salmon Sandpiper Savanna Seal Sequoia Shark Shore
  Shrew Sky Sloth Snail Sparrow Spring Spruce Squirrel Stag Star Starling Stork Stream Summit Sun
  Swallow Swan Tamarin Tapir Teak Tern Thicket Thistle Thrush Thunder Tide Tiger Toad Toucan Trail
  Trout Tulip Tundra Turtle Valley Vine Violet Volcano Vole Wallaby Walrus Warbler Waterfall Wave
  Weasel Whale Willow Wind Wisteria Wolf Wombat Woodland Wren Yak Yarrow Zebra Zephyr Zinnia
`.trim().split(/\s+/);
