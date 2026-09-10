import 'package:flutter/material.dart';
import 'package:flame/game.dart';
import 'dart:math';

void main() {
  runApp(const BusFeverPartyApp());
}

class BusFeverPartyApp extends StatelessWidget {
  const BusFeverPartyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Bus Fever Party',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark(),
      home: const GameScreen(),
    );
  }
}

enum BusColor { red, blue, green, yellow, purple }

class BusData {
  final int id;
  final BusColor color;
  final String dir; // 'UP', 'DOWN', 'LEFT', 'RIGHT'
  int r;
  int c;
  final int length;
  int passengersCount;
  final int maxCapacity;

  BusData({
    required this.id,
    required this.color,
    required this.dir,
    required this.r,
    required this.c,
    this.length = 2,
    this.passengersCount = 0,
    this.maxCapacity = 3,
  });
}

class GameScreen extends StatefulWidget {
  const GameScreen({super.key});

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  int level = 1;
  int score = 0;
  int coins = 100;
  int adBonusSlots = 0; // Max +2 watchable ad slots

  List<BusColor> passengerQueue = [];
  List<BusData> gridBuses = [];
  List<BusData> boardingLane = [];

  int get baseSlots => min(3 + (level - 1) ~/ 3, 4);
  int get activeSlots => baseSlots + adBonusSlots;
  int get maxCapacitySlots => 6;

  @override
  void initState() {
    super.initState();
    startLevel(1);
  }


  void startLevel(int lvl) {
    setState(() {
      level = lvl;
      boardingLane.clear();
      generateLevelData();
    });
  }

  void generateLevelData() {
    List<BusColor> activeColors = BusColor.values.take(3 + (level - 1) ~/ 2).toList();
    int totalBuses = 3 + level * 2;
    passengerQueue.clear();
    gridBuses.clear();

    // Fill passenger queue (3 per bus)
    for (int i = 0; i < totalBuses; i++) {
      BusColor c = activeColors[i % activeColors.length];
      for (int p = 0; p < 3; p++) {
        passengerQueue.add(c);
      }
    }
    passengerQueue.shuffle();

    // Grid placement logic
    List<List<bool>> occupied = List.generate(6, (_) => List.generate(6, (_) => false));
    List<String> dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    Random rand = Random();

    int busId = 1;
    for (int i = 0; i < totalBuses; i++) {
      BusColor color = activeColors[i % activeColors.length];
      bool placed = false;
      int attempts = 0;

      while (!placed && attempts < 100) {
        attempts++;
        String d = dirs[rand.nextInt(dirs.length)];
        bool isVert = d == 'UP' || d == 'DOWN';
        int len = 2;

        int maxR = isVert ? 6 - len : 5;
        int maxC = isVert ? 5 : 6 - len;

        int r = rand.nextInt(maxR + 1);
        int c = rand.nextInt(maxC + 1);

        bool overlap = false;
        for (int l = 0; l < len; l++) {
          int nr = isVert ? r + l : r;
          int nc = isVert ? c : c + l;
          if (occupied[nr][nc]) {
            overlap = true;
            break;
          }
        }

        if (!overlap) {
          for (int l = 0; l < len; l++) {
            int nr = isVert ? r + l : r;
            int nc = isVert ? c : c + l;
            occupied[nr][nc] = true;
          }

          gridBuses.add(BusData(
            id: busId++,
            color: color,
            dir: d,
            r: r,
            c: c,
          ));
          placed = true;
        }
      }
    }
  }

  bool canBusExit(BusData bus) {
    if (bus.dir == 'UP') {
      for (int r = bus.r - 1; r >= 0; r--) {
        if (isCellOccupied(r, bus.c, bus.id)) return false;
      }
    } else if (bus.dir == 'DOWN') {
      for (int r = bus.r + bus.length; r < 6; r++) {
        if (isCellOccupied(r, bus.c, bus.id)) return false;
      }
    } else if (bus.dir == 'LEFT') {
      for (int c = bus.c - 1; c >= 0; c--) {
        if (isCellOccupied(bus.r, c, bus.id)) return false;
      }
    } else if (bus.dir == 'RIGHT') {
      for (int c = bus.c + bus.length; c < 6; c++) {
        if (isCellOccupied(bus.r, c, bus.id)) return false;
      }
    }
    return true;
  }

  bool isCellOccupied(int r, int c, int ignoreId) {
    for (var b in gridBuses) {
      if (b.id == ignoreId) continue;
      bool isVert = b.dir == 'UP' || b.dir == 'DOWN';
      for (int l = 0; l < b.length; l++) {
        int br = isVert ? b.r + l : b.r;
        int bc = isVert ? b.c : b.c + l;
        if (br == r && bc == c) return true;
      }
    }
    return false;
  }

  void tapBus(BusData bus) {
    if (boardingLane.length >= unlockedSlots) return;
    if (canBusExit(bus)) {
      setState(() {
        gridBuses.remove(bus);
        boardingLane.add(bus);
        processBoarding();
      });
    }
  }

  void processBoarding() {
    while (passengerQueue.isNotEmpty) {
      BusColor frontColor = passengerQueue.first;
      var targetBus = boardingLane.firstWhere(
        (b) => b.color == frontColor && b.passengersCount < b.maxCapacity,
        orElse: () => BusData(id: -1, color: BusColor.red, dir: '', r: 0, c: 0),
      );

      if (targetBus.id != -1) {
        passengerQueue.removeAt(0);
        targetBus.passengersCount++;
        score += 10;

        if (targetBus.passengersCount >= targetBus.maxCapacity) {
          boardingLane.remove(targetBus);
          score += 50;
          coins += 5;
        }
      } else {
        break;
      }
    }

    // Check Win
    if (gridBuses.isEmpty && boardingLane.isEmpty && passengerQueue.isEmpty) {
      showDialog(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('LEVEL CLEARED! ??'),
          content: Text('Level  completed!'),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(context);
                startLevel(level + 1);
              },
              child: const Text('NEXT LEVEL'),
            )
          ],
        ),
      );
    }
  }

  Color getMaterialColor(BusColor color) {
    switch (color) {
      case BusColor.red: return Colors.red;
      case BusColor.blue: return Colors.blue;
      case BusColor.green: return Colors.green;
      case BusColor.yellow: return Colors.amber;
      case BusColor.purple: return Colors.purple;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        title: Text('LEVEL ', style: const TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12.0),
            child: Row(
              children: [
                Text('?  ', style: const TextStyle(color: Colors.amber, fontWeight: FontWeight.bold)),
                const SizedBox(width: 12),
                Text('?? ', style: const TextStyle(color: Colors.lightBlueAccent, fontWeight: FontWeight.bold)),
              ],
            ),
          )
        ],
      ),
      body: Column(
        children: [
          // Queue section
          Container(
            padding: const EdgeInsets.all(12),
            color: const Color(0xFF1E293B),
            child: SizedBox(
              height: 40,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: passengerQueue.length,
                itemBuilder: (ctx, idx) => Container(
                  width: 36,
                  margin: const EdgeInsets.only(right: 8),
                  decoration: BoxDecoration(
                    color: getMaterialColor(passengerQueue[idx]),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: idx == 0 ? 2 : 0),
                  ),
                  child: const Center(child: Text('??', style: TextStyle(fontSize: 14))),
                ),
              ),
            ),
          ),
          // Boarding Lane section
          Container(
            padding: const EdgeInsets.all(12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: List.generate(maxPossibleSlots, (index) {
                if (index < unlockedSlots) {
                  BusData? bus = index < boardingLane.length ? boardingLane[index] : null;
                  return Container(
                    width: 60,
                    height: 60,
                    decoration: BoxDecoration(
                      color: bus != null ? getMaterialColor(bus.color) : Colors.black26,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.white24),
                    ),
                    child: bus != null
                        ? Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text('BUS ', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                              Text('/3', style: const TextStyle(fontSize: 12)),
                            ],
                          )
                        : null,
                  );
                } else {
                  return GestureDetector(
                    onTap: () {
                      setState(() {
                        unlockedSlots++;
                      });
                    },
                    child: Container(
                      width: 60,
                      height: 60,
                      decoration: BoxDecoration(
                        color: Colors.amber.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.amber, style: BorderStyle.solid),
                      ),
                      child: const Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text('?? AD', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.amber)),
                          Text('UNLOCK', style: TextStyle(fontSize: 9, color: Colors.amber)),
                        ],
                      ),
                    ),
                  );
                }
              }),
            ),
          ),
          // Grid Stage
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                double gridWidth = constraints.maxWidth - 32;
                double cellSize = gridWidth / 6;

                return Center(
                  child: Container(
                    width: gridWidth,
                    height: gridWidth,
                    decoration: BoxDecoration(
                      color: Colors.black45,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.white12),
                    ),
                    child: Stack(
                      children: gridBuses.map((bus) {
                        bool isVert = bus.dir == 'UP' || bus.dir == 'DOWN';
                        double w = (isVert ? 1 : bus.length) * cellSize;
                        double h = (isVert ? bus.length : 1) * cellSize;

                        return Positioned(
                          left: bus.c * cellSize,
                          top: bus.r * cellSize,
                          width: w,
                          height: h,
                          child: GestureDetector(
                            onTap: () => tapBus(bus),
                            child: Container(
                              margin: const EdgeInsets.all(3),
                              decoration: BoxDecoration(
                                color: getMaterialColor(bus.color),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: Colors.white70),
                              ),
                              child: Center(
                                child: Text(
                                  bus.dir == 'UP' ? '?' : bus.dir == 'DOWN' ? '?' : bus.dir == 'LEFT' ? '?' : '?',
                                  style: const TextStyle(fontSize: 18, color: Colors.white, fontWeight: FontWeight.bold),
                                ),
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
