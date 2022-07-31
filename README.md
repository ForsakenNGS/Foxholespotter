# foxhole-spotter

https://forsakenngs.github.io/foxhole-spotter/

Atillery spotting tool for [Foxhole](https://www.foxholegame.com/) with visual aid.

Used for guiding artillery shells, mortars etc. safely to the enemy.

## Simple use-case

- Position yourself between the artillery/mortar/... and your desired target
- Use your binoculars to measure the distance and azimuth to your target and the friendly gun and input them into the tool
- Relay the final distance and azimuth values to your crew

### Correcting for wind etc.

Correction values can be set as east/west and north/south offsets for each gun.
The green line, normally pointing from the gun to the target, will adjust accordingly and show you where you are aiming at.

## Advanced use-cases

- With the green (+) icon you can add additional guns and/or targets
  - Each gun will have a dist/azim set for each target
  - Corrections are always done per gun and will apply to all targets (usually one gun will only shell one target anyway)
- With the smaller (+) icon (with an extra circle) you can add one or more reference points
  - Reference points allow spotting over further distances than the binoculars can see
  - Example usage:
    - Add one ref-point and input the values (dist/azim) from the gun to the ref-point (e.g. a tree or building)
    - Add the values from the spotting location to the same ref-point
    - Add the target values from the spotting location (ideally double-check the visualization to make sure things look sane)
    - Shell them :)
  - Reference points can be chained as long as you like and mixed with multiple guns

## Credit

Despite not reusing anything from there, I want to credit https://github.com/earthgrazer/foxhole-artillery-calc since it was a good source of inspiration. If this tool doesn't work well for you, feel free to check out that one as an alternative.

## Feedback

Feel free to file bug-reports or feature-request in the repository. Pull requests are also welcome. I'll try my best, but don't expect immediate reactions, this is just a 1-man hobby project.
