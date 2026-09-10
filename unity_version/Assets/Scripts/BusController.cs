using UnityEngine;

public enum BusColor { Red, Blue, Green, Yellow, Purple }

public class BusController : MonoBehaviour
{
    public int busId;
    public BusColor busColor;
    public string direction; // "UP", "DOWN", "LEFT", "RIGHT"
    public int gridR;
    public int gridC;
    public int busLength = 2;
    public int passengersCount = 0;
    public int maxCapacity = 3;

    private BusGameManager gameManager;

    void Start()
    {
        gameManager = FindObjectOfType<BusGameManager>();
    }

    void OnMouseDown()
    {
        if (gameManager != null)
        {
            gameManager.OnBusTapped(this);
        }
    }

    public bool CanExitGrid(BusController[,] grid, int gridSize)
    {
        if (direction == "UP")
        {
            for (int r = gridR - 1; r >= 0; r--)
                if (grid[r, gridC] != null && grid[r, gridC] != this) return false;
        }
        else if (direction == "DOWN")
        {
            for (int r = gridR + busLength; r < gridSize; r++)
                if (grid[r, gridC] != null && grid[r, gridC] != this) return false;
        }
        else if (direction == "LEFT")
        {
            for (int c = gridC - 1; c >= 0; c--)
                if (grid[gridR, c] != null && grid[gridR, c] != this) return false;
        }
        else if (direction == "RIGHT")
        {
            for (int c = gridC + busLength; c < gridSize; c++)
                if (grid[gridR, c] != null && grid[gridR, c] != this) return false;
        }

        return true;
    }
}
