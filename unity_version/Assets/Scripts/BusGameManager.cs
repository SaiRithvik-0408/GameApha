using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

public class BusGameManager : MonoBehaviour
{
    public const int GRID_SIZE = 6;
    public int currentLevel = 1;
    public int score = 0;
    public int coins = 100;
    public int adBonusSlots = 0; // max +2 extra slots

    public int GetBaseSlots() {
        return Mathf.Min(3 + (currentLevel - 1) / 3, 4); // Starts at 3, unlocks +1 as level increases
    }

    public int GetTotalActiveSlots() {
        return GetBaseSlots() + adBonusSlots;
    }


    public List<BusColor> passengerQueue = new List<BusColor>();
    public List<BusController> boardingLane = new List<BusController>();
    public List<BusController> allBuses = new List<BusController>();

    private BusController[,] grid = new BusController[GRID_SIZE, GRID_SIZE];

    void Start()
    {
        GenerateLevel(currentLevel);
    }

    public void GenerateLevel(int levelNum)
    {
        allBuses.Clear();
        passengerQueue.Clear();
        boardingLane.Clear();
        grid = new BusController[GRID_SIZE, GRID_SIZE];

        int totalBuses = 3 + levelNum * 2;
        BusColor[] activeColors = new BusColor[] { BusColor.Red, BusColor.Blue, BusColor.Green, BusColor.Yellow };

        for (int i = 0; i < totalBuses; i++)
        {
            BusColor col = activeColors[i % activeColors.Length];
            for (int p = 0; p < 3; p++)
            {
                passengerQueue.Add(col);
            }
        }

        // Shuffle queue
        for (int i = 0; i < passengerQueue.Count; i++)
        {
            BusColor temp = passengerQueue[i];
            int randomIndex = Random.Range(i, passengerQueue.Count);
            passengerQueue[i] = passengerQueue[randomIndex];
            passengerQueue[randomIndex] = temp;
        }

        Debug.Log("Generated Level " + levelNum + " with " + totalBuses + " buses.");
    }

    public void OnBusTapped(BusController bus)
    {
        if (boardingLane.Count >= unlockedSlots) return;

        if (bus.CanExitGrid(grid, GRID_SIZE))
        {
            // Move Bus to Station
            boardingLane.Add(bus);
            ProcessBoarding();
        }
        else
        {
            Debug.Log("Bus path blocked!");
        }
    }

    public void ProcessBoarding()
    {
        while (passengerQueue.Count > 0)
        {
            BusColor frontPassenger = passengerQueue[0];
            BusController targetBus = boardingLane.Find(b => b.busColor == frontPassenger && b.passengersCount < b.maxCapacity);

            if (targetBus != null)
            {
                passengerQueue.RemoveAt(0);
                targetBus.passengersCount++;
                score += 10;

                if (targetBus.passengersCount >= targetBus.maxCapacity)
                {
                    boardingLane.Remove(targetBus);
                    Destroy(targetBus.gameObject);
                    score += 50;
                    coins += 5;
                }
            }
            else
            {
                break;
            }
        }
    }

    public void WatchAdToUnlockSlot()
    {
        if (unlockedSlots < maxPossibleSlots)
        {
            unlockedSlots++;
            Debug.Log("Unlocked Slot! Total active slots: " + unlockedSlots);
        }
    }
}
