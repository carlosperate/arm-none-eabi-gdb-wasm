static volatile int counter;
static int add_one(int value) { return value + 1; }
int main(void) {
  for (;;) counter = add_one(counter);
}
